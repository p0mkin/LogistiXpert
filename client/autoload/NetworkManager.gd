extends Node

# WebSocket connection parameters
const HOST = "127.0.0.1"
const PORT = 3000
const WS_URL = "ws://%s:%d/ws" % [HOST, PORT]
const HTTP_URL = "http://%s:%d/api" % [HOST, PORT]

# Local connection states
var socket: WebSocketPeer = null
var is_connected: bool = false
var auth_token: String = ""

# Alias used by scenes for HTTP Authorization header injection
var jwt_token: String:
	get: return auth_token

# Request counter for tracking asynchronous packets
var request_counter: int = 0
var pending_requests: Dictionary = {}

# Reconnection system details
var reconnect_timer: Timer = null
var reconnect_delay: float = 1.0 # starts at 1s, scales exponentially
const MAX_RECONNECT_DELAY = 30.0

# Central client communication signals
signal connection_status_changed(connected)
signal auth_completed(success, message)
signal auction_list_received(listings)
signal auction_bid_resolved(success, data)
signal auction_bid_received(update)
signal border_event_resolved(type, data)    # 'cleared', 'bust', 'bribe_success', 'bribe_fail', 'run_success', 'run_fail'
signal ws_message_received(packet)          # broadcast all WS packets to any scene
signal route_completed(data)                # truck delivered, payout ready
signal driver_snitched(data)               # betrayal bust event
signal engine_breakdown(data)              # mid-route engine failure
signal driver_wreck(data)                  # microsleep crash
signal weigh_station_fine(data)            # tacho violation fine
signal border_inspection_started(data)     # truck paused at customs

func _ready() -> void:
	# Build reconnection timer
	reconnect_timer = Timer.new()
	reconnect_timer.one_shot = true
	reconnect_timer.timeout.connect(_on_reconnect_timeout)
	add_child(reconnect_timer)

func _process(_delta: float) -> void:
	if socket:
		socket.poll() # MANDATORY call every frame in Godot 4 raw WebSockets!
		
		var state = socket.get_ready_state()
		match state:
			WebSocketPeer.STATE_OPEN:
				if not is_connected:
					_on_connected()
				
				# Drain all available packets
				while socket.get_available_packet_count() > 0:
					var packet = socket.get_packet()
					var data_str = packet.get_string_from_utf8()
					_parse_and_route_message(data_str)
					
			WebSocketPeer.STATE_CLOSED:
				if is_connected:
					_on_disconnected()
				
				var code = socket.get_close_code()
				var reason = socket.get_close_reason()
				if code != -1:
					print("[Network] Socket closed by server: %d (%s)" % [code, reason])
					socket = null
					_trigger_reconnect()
			
			WebSocketPeer.STATE_CONNECTING:
				pass # Waiting for upgrade handshake

# ==========================================
# CONNECTIVITY HANDLERS
# ==========================================
func connect_to_server() -> void:
	if auth_token.is_empty():
		print("[Network] Cannot open socket connection: Auth Token missing.")
		return
		
	socket = WebSocketPeer.new()
	
	# Append handshake token to query parameter
	var url_with_token = "%s?token=%s" % [WS_URL, auth_token]
	print("[Network] Connecting to raw WebSocket: ", url_with_token)
	
	var err = socket.connect_to_url(url_with_token)
	if err != OK:
		print("[Network] Socket open request failed with error: ", err)
		_trigger_reconnect()

func disconnect_from_server() -> void:
	if socket:
		socket.close(1000, "User logout")
		socket = null
	is_connected = false
	connection_status_changed.emit(false)

func _on_connected() -> void:
	is_connected = true
	reconnect_delay = 1.0 # Reset backoff
	print("[Network] Live connection established with game server!")
	connection_status_changed.emit(true)

func _on_disconnected() -> void:
	is_connected = false
	print("[Network] Connection severed.")
	connection_status_changed.emit(false)

func _trigger_reconnect() -> void:
	if reconnect_timer.is_stopped() and not auth_token.is_empty():
		print("[Network] Attempting reconnection in %.1fs..." % reconnect_delay)
		reconnect_timer.start(reconnect_delay)
		reconnect_delay = min(reconnect_delay * 2.0, MAX_RECONNECT_DELAY) # Exponential scale

func _on_reconnect_timeout() -> void:
	connect_to_server()

# ==========================================
# HTTP REST fallbacks
# ==========================================
func request_login(username: String, passw: String) -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result, response_code, headers, body):
		if response_code == 200:
			var json = JSON.parse_string(body.get_string_from_utf8())
			if json and json.has("token"):
				auth_token = json.token
				GameState.sync_user_data(json.user)
				auth_completed.emit(true, "Login Successful!")
				# Launch real-time session immediately
				connect_to_server()
			else:
				auth_completed.emit(false, "Invalid server response parameters.")
		else:
			var err_msg = "Connection timed out."
			if response_code == 401:
				err_msg = "Invalid username or password credentials."
			auth_completed.emit(false, err_msg)
		http.queue_free()
	)
	
	var headers = ["Content-Type: application/json"]
	var body_data = JSON.stringify({"username": username, "password": passw})
	http.request(HTTP_URL + "/auth/login", headers, HTTPClient.METHOD_POST, body_data)

func request_register(username: String, passw: String) -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result, response_code, headers, body):
		if response_code == 201:
			var json = JSON.parse_string(body.get_string_from_utf8())
			auth_completed.emit(true, json.get("message", "Registered successfully! Now log in."))
		else:
			var json = JSON.parse_string(body.get_string_from_utf8())
			var err_msg = json.get("message", "Registration failed.") if json else "Server unreachable."
			auth_completed.emit(false, err_msg)
		http.queue_free()
	)
	
	var headers = ["Content-Type: application/json"]
	var body_data = JSON.stringify({"username": username, "password": passw})
	http.request(HTTP_URL + "/auth/register", headers, HTTPClient.METHOD_POST, body_data)

# ==========================================
# WS ONEWAY TRANSMITTERS
# ==========================================
func send_bid(auction_id: String, amount: float) -> String:
	request_counter += 1
	var req_id = "req_bid_%d" % request_counter
	
	var message = {
		"type": "auction:bid",
		"payload": {
			"auctionId": auction_id,
			"amount": amount
		},
		"requestId": req_id
	}
	
	_send_payload(message)
	return req_id

func trigger_border_action(truck_id: String, choice_action: String, bribe_amount: float = 0.0) -> String:
	request_counter += 1
	var req_id = "req_border_%d" % request_counter
	
	var payload_data: Dictionary = {
		"truckId": truck_id,
		"action": choice_action  # CLEARANCE, BRIBE, RUN
	}
	if bribe_amount > 0.0:
		payload_data["bribeAmount"] = bribe_amount
	
	var message = {
		"type": "border:calculate_clearance",
		"payload": payload_data,
		"requestId": req_id
	}
	
	_send_payload(message)
	return req_id

func _send_payload(data: Dictionary) -> void:
	if not is_connected or not socket:
		print("[Network] Cannot dispatch packet: client is disconnected.")
		return
		
	var json_str = JSON.stringify(data)
	socket.send_text(json_str)

# ==========================================
# MESSAGE PARSER AND ROUTING SYSTEM
# ==========================================
func _parse_and_route_message(json_str: String) -> void:
	var json = JSON.parse_string(json_str)
	if not json or not json.has("type"):
		print("[Network] Corrupt or unparseable socket packet received: ", json_str)
		return
		
	var type = json.type
	var payload = json.get("payload", {})
	var reply_to = json.get("replyTo", "")
	
	# Broadcast every packet to any connected scene
	ws_message_received.emit(json)
	
	match type:
		"error":
			print("[Network] Received Error Event: ", payload.get("message", ""))
			if reply_to.begins_with("req_bid_"):
				auction_bid_resolved.emit(false, payload)
				
		"auction:bid_receipt":
			auction_bid_resolved.emit(true, payload)
			
		"auction:bid_update":
			auction_bid_received.emit(payload)
			
		"border:cleared":
			border_event_resolved.emit("cleared", payload)
			
		"border:bust":
			border_event_resolved.emit("bust", payload)
		
		"border:bribe_success":
			border_event_resolved.emit("bribe_success", payload)
		
		"border:bribe_fail":
			border_event_resolved.emit("bribe_fail", payload)
			_show_emergency_alert("💸 BRIBE REJECTED", payload.get("message", "Bribery failed — officer called backup."), Color(1.0, 0.4, 0.1, 1.0))
		
		"border:run_success":
			border_event_resolved.emit("run_success", payload)
		
		"border:run_fail":
			border_event_resolved.emit("run_fail", payload)
			_show_emergency_alert("🚧 BARRICADE CRASH", payload.get("message", "Border run failed — crashed."), Color(1.0, 0.2, 0.2, 1.0))
		
		"route:completed":
			route_completed.emit(payload)
			GameState.update_balances(0.0, float(payload.get("payout", 0)))
		
		"alert:driver_snitched":
			driver_snitched.emit(payload)
			GameState.update_balances(-float(payload.get("bustFine", 0)), 0.0)
			GameState.police_heat = min(GameState.police_heat + payload.get("bustHeat", 0), 100)
			_show_emergency_alert(
				"🐀 DRIVER BETRAYAL — " + payload.get("driverName", "Unknown"),
				payload.get("message", "Driver snitched to police."),
				Color(0.9, 0.1, 0.1, 1.0)
			)
		
		"alert:engine_breakdown":
			engine_breakdown.emit(payload)
			_show_emergency_alert(
				"⚙ ENGINE FAILURE — " + payload.get("model", "Truck"),
				payload.get("message", "Truck broke down mid-route."),
				Color(1.0, 0.55, 0.1, 1.0)
			)
		
		"alert:driver_wreck":
			driver_wreck.emit(payload)
			_show_emergency_alert(
				"💥 CRASH — MICROSLEEP WRECK",
				payload.get("message", "Driver fell asleep at the wheel."),
				Color(1.0, 0.15, 0.15, 1.0)
			)
		
		"alert:weigh_station_fine":
			weigh_station_fine.emit(payload)
			GameState.update_balances(-float(payload.get("fine", 0)), 0.0)
			_show_emergency_alert(
				"🏛 WEIGH STATION FINE",
				payload.get("message", "Tachograph violation fined."),
				Color(1.0, 0.75, 0.1, 1.0)
			)
		
		"border:inspection_event":
			border_inspection_started.emit(payload)
			
		"DISPATCH_TICK", "BORDER_CHECK", "ROUTE_COMPLETE", "MICROSLEEP_CRASH", "SEIZURE":
			# Legacy keys — routed via ws_message_received broadcast to DispatchCenter
			pass
			
		"pong":
			pass
			
		_:
			print("[Network] Unrouted event type: ", type)

# ==========================================
# GLOBAL EMERGENCY ALERT OVERLAY
# Injects a red-flash critical alert banner into the current scene
# ==========================================
var _alert_overlay: Control = null

func _show_emergency_alert(title: String, message: String, color: Color) -> void:
	# Remove any existing alert
	if _alert_overlay and is_instance_valid(_alert_overlay):
		_alert_overlay.queue_free()
	
	var root = get_tree().get_root()
	if not root:
		return
	
	var overlay = CanvasLayer.new()
	overlay.layer = 128  # Top of z-stack
	root.add_child(overlay)
	_alert_overlay = overlay
	
	# Dark dimming backdrop
	var dim = ColorRect.new()
	dim.color = Color(0.0, 0.0, 0.0, 0.55)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(dim)
	
	# Alert box
	var box = PanelContainer.new()
	box.position = Vector2(240, 240)
	box.size = Vector2(800, 200)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.04, 0.06, 0.97)
	style.border_color = color
	style.border_width_bottom = 3
	style.border_width_top = 3
	style.border_width_left = 5
	style.border_width_right = 5
	style.set_corner_radius_all(8)
	box.add_theme_stylebox_override("panel", style)
	overlay.add_child(box)
	
	var vbox = VBoxContainer.new()
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 12)
	box.add_child(vbox)
	
	var t_lbl = Label.new()
	t_lbl.text = title
	t_lbl.add_theme_font_size_override("font_size", 22)
	t_lbl.add_theme_color_override("font_color", color)
	t_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(t_lbl)
	
	var m_lbl = Label.new()
	m_lbl.text = message
	m_lbl.add_theme_font_size_override("font_size", 14)
	m_lbl.add_theme_color_override("font_color", Color(0.85, 0.8, 0.9, 1.0))
	m_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	m_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(m_lbl)
	
	var dismiss_btn = Button.new()
	dismiss_btn.text = "[ DISMISS ]"
	dismiss_btn.add_theme_font_size_override("font_size", 13)
	dismiss_btn.add_theme_color_override("font_color", color)
	dismiss_btn.pressed.connect(overlay.queue_free)
	vbox.add_child(dismiss_btn)
	
	# Auto-dismiss after 8 seconds
	var tween = create_tween()
	tween.tween_interval(7.5)
	tween.tween_property(box, "modulate:a", 0.0, 0.5)
	tween.tween_callback(overlay.queue_free)
	
	# Flash the border twice
	var flash = create_tween()
	flash.set_loops(3)
	flash.tween_property(box, "modulate", Color(1.5, 1.5, 1.5, 1.0), 0.15)
	flash.tween_property(box, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.15)

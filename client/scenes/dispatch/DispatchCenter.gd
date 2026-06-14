extends Control

# ==========================================
# DISPATCH COMMAND CENTER
# Select contracts (legal or contraband),
# assign trucks+drivers, launch routes,
# and watch live telemetry feed.
# ==========================================

@onready var back_btn: Button = %BackBtn
@onready var player_lbl: Label = %PlayerLabel
@onready var balance_lbl: Label = %BalanceLabel
@onready var dirty_lbl: Label = %DirtyLabel
@onready var contract_list: VBoxContainer = %ContractList
@onready var active_routes_list: VBoxContainer = %ActiveRoutesList
@onready var dispatch_panel: PanelContainer = %DispatchPanel
@onready var selected_contract_lbl: Label = %SelectedContractLbl
@onready var truck_select_box: OptionButton = %TruckSelectBox
@onready var launch_btn: Button = %LaunchBtn
@onready var console_lbl: Label = %ConsoleLabel
@onready var heat_lbl: Label = %HeatLabel
@onready var tab_legal_btn: Button = %TabLegalBtn
@onready var tab_contra_btn: Button = %TabContraBtn

var cities_data: Dictionary = {}
var selected_contract_is_cross_region: bool = false
var local_simulating_trucks: Dictionary = {}

var api_base: String:
	get: return NetworkManager.HTTP_URL
var available_trucks: Array = []
var legal_contracts: Array = []
var contraband_jobs: Array = []
var active_routes: Array = []
var selected_contract: Dictionary = {}
var is_contraband_mode: bool = false

# Tacho dial telemetry for selected active route
var tacho_anim_time: float = 0.0
var live_progress: float = 0.0  # 0.0 - 1.0

var autopilot_policy_box: OptionButton = null
var bypass_schengen_checkbox: CheckBox = null
var clock_lbl: Label = null

func _ready() -> void:
	JuiceEngine.tween_in(self)
	_load_cities_data()
	_apply_theme()
	player_lbl.text = GameState.username.to_upper()
	_refresh_header()
	
	clock_lbl = Label.new()
	clock_lbl.name = "ClockLabel"
	clock_lbl.add_theme_font_size_override("font_size", 14)
	clock_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	if player_lbl and player_lbl.get_parent():
		player_lbl.get_parent().add_child(clock_lbl)
		clock_lbl.position = player_lbl.position + Vector2(250, 0)
	
	GameState.balance_updated.connect(_on_balances_updated)
	GameState.reputation_updated.connect(_on_reputation_updated)
	NetworkManager.ws_message_received.connect(_on_ws_message)
	NetworkManager.border_inspection_started.connect(_on_border_inspection)
	NetworkManager.border_event_resolved.connect(_on_border_resolved)
	NetworkManager.route_progress_updated.connect(_on_route_progress)
	NetworkManager.route_completed.connect(_on_route_completed)
	
	back_btn.pressed.connect(_on_back)
	launch_btn.pressed.connect(_on_launch_dispatch)
	tab_legal_btn.pressed.connect(_show_legal_tab)
	tab_contra_btn.pressed.connect(_show_contra_tab)
	
	# Create and add Autopilot Policy Selector dynamically
	var policy_lbl = Label.new()
	policy_lbl.text = "AUTOPILOT POLICY:"
	policy_lbl.add_theme_font_size_override("font_size", 11)
	policy_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.8))
	
	autopilot_policy_box = OptionButton.new()
	autopilot_policy_box.name = "AutopilotPolicyBox"
	autopilot_policy_box.add_item("🛡 SAFE (Never risk crossings/weather)", 0)
	autopilot_policy_box.add_item("⚖ AVERAGE (Auto-solve using worker skills)", 1)
	autopilot_policy_box.add_item("🔥 GREEDY (Speedy, aggressive, high-risk)", 2)
	autopilot_policy_box.add_item("🎮 INTERACTIVE (Pause & prompt for manual actions)", 3)
	
	bypass_schengen_checkbox = CheckBox.new()
	bypass_schengen_checkbox.name = "BypassSchengenCheckbox"
	bypass_schengen_checkbox.text = "🛰 SCHENGEN BYPASS (+30% Distance)"
	bypass_schengen_checkbox.add_theme_font_size_override("font_size", 11)
	bypass_schengen_checkbox.add_theme_color_override("font_color", Color(0.75, 0.3, 1.0, 1.0))
	
	var dispatch_inner = %DispatchPanel.get_node("DispatchInner")
	var launch_idx = %LaunchBtn.get_index()
	dispatch_inner.add_child(policy_lbl)
	dispatch_inner.move_child(policy_lbl, launch_idx)
	dispatch_inner.add_child(autopilot_policy_box)
	dispatch_inner.move_child(autopilot_policy_box, launch_idx + 1)
	dispatch_inner.add_child(bypass_schengen_checkbox)
	dispatch_inner.move_child(bypass_schengen_checkbox, launch_idx + 2)
	
	_fetch_contracts()
	_fetch_active_routes()
	_fetch_trucks()
	
	truck_select_box.item_selected.connect(_on_truck_selected)
	
	set_process(true)

func _process(delta: float) -> void:
	tacho_anim_time += delta
	if clock_lbl and is_instance_valid(clock_lbl):
		clock_lbl.text = GameState.get_simulated_time_string()
		
	# Process local mock simulation progress
	var simulation_keys = local_simulating_trucks.keys()
	for t_id in simulation_keys:
		local_simulating_trucks[t_id] += delta * 12.0 # 12% progress per second (speedy debug autopilot)
		var pct = clamp(local_simulating_trucks[t_id], 0.0, 100.0)
		
		var found_route = false
		for route in active_routes:
			if route.get("truckId") == t_id:
				route["progressPct"] = pct
				found_route = true
				break
		
		if found_route:
			_render_active_routes()
			live_progress = pct / 100.0
			
		if pct >= 100.0:
			local_simulating_trucks.erase(t_id)
			var comp_route = {}
			for r in active_routes:
				if r.get("truckId") == t_id:
					comp_route = r
					break
			if not comp_route.is_empty():
				_on_route_completed(comp_route)
				
	# Update live telemetry panel status
	if has_node("%TelemetryStatus"):
		if live_progress > 0.0:
			var active_route_info = ""
			for r in active_routes:
				if float(r.get("progressPct", 0.0)) > 0.0:
					active_route_info = "%s ➔ %s (%d%%)" % [r.get("originCity", "?"), r.get("destinationCity", "?"), int(r.get("progressPct", 0.0))]
					break
			%TelemetryStatus.text = "ACTIVE ROUTE: " + active_route_info + "\nTACHOGRAPH SWEEPING...\nGrid connection: SECURE FEED"
			%TelemetryStatus.add_theme_color_override("font_color", Color(0.2, 0.85, 1.0))
		else:
			%TelemetryStatus.text = "SYSTEM STANDBY // READY FOR DISPATCH\nAwaiting next logistics command..."
			%TelemetryStatus.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
			
	queue_redraw()  # For tachograph arc animation

func _draw() -> void:
	if not has_node("%LiveTelemetryPanel"):
		return
	var panel = %LiveTelemetryPanel
	if not panel.is_visible_in_tree():
		return
	var panel_pos = panel.global_position
	var panel_size = panel.size
	
	var center = panel_pos + Vector2(panel_size.x - 60, panel_size.y / 2.0)
	var radius = 38.0
	
	# Outer ring
	draw_arc(center, radius, deg_to_rad(140), deg_to_rad(400), 48, Color(0.2, 0.85, 1.0, 0.1), 2.0)
	
	# Animated sweep needle based on live_progress
	var sweep_angle = lerp(140.0, 400.0, live_progress)
	draw_arc(center, radius, deg_to_rad(140), deg_to_rad(sweep_angle), 32, Color(0.2, 0.85, 1.0, 0.6), 3.0)
	
	# Center dot
	draw_circle(center, 4, Color(0.2, 0.85, 1.0, 0.8))
	
	# Tick marks around dial (0-10h markers)
	for i in range(11):
		var angle = deg_to_rad(lerp(140.0, 400.0, float(i) / 10.0))
		var inner = center + Vector2(cos(angle), sin(angle)) * (radius - 6)
		var outer = center + Vector2(cos(angle), sin(angle)) * radius
		var tick_color = Color(0.2, 0.85, 1.0, 0.4) if i < 10 else Color(0.9, 0.2, 0.2, 0.8)
		draw_line(inner, outer, tick_color, 1.5)

# ==========================================
# API REQUESTS
# ==========================================
func _fetch_contracts() -> void:
	# Fetch Legal Contracts
	var http_legal = HTTPRequest.new()
	add_child(http_legal)
	http_legal.request_completed.connect(_on_legal_contracts_response.bind(http_legal))
	http_legal.request(
		api_base + "/dispatch/contracts/legal",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)
	
	# Fetch Contraband Jobs
	var http_contra = HTTPRequest.new()
	add_child(http_contra)
	http_contra.request_completed.connect(_on_contraband_jobs_response.bind(http_contra))
	http_contra.request(
		api_base + "/dispatch/contracts/contraband",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _fetch_active_routes() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_active_routes_response.bind(http))
	http.request(
		api_base + "/dispatch/active",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _fetch_trucks() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_trucks_response.bind(http))
	http.request(
		api_base + "/garage",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _launch_dispatch() -> void:
	if selected_contract.is_empty():
		_log("No contract selected.", Color(0.925, 0.607, 0.141))
		return
	
	var truck_idx = truck_select_box.get_selected_id()
	if truck_idx < 0 or truck_idx >= available_trucks.size():
		_log("No truck selected.", Color(0.925, 0.607, 0.141))
		return
	
	var truck_id = available_trucks[truck_idx].get("id", "")
	
	var policy_idx = autopilot_policy_box.get_selected_id()
	var policy_str = "SAFE"
	if policy_idx == 1:
		policy_str = "AVERAGE"
	elif policy_idx == 2:
		policy_str = "GREEDY"
	elif policy_idx == 3:
		policy_str = "INTERACTIVE"
		
	var bypass_val = false
	if bypass_schengen_checkbox and is_instance_valid(bypass_schengen_checkbox):
		bypass_val = bypass_schengen_checkbox.button_pressed
		
	var body: Dictionary = {
		"truckId": truck_id,
		"autopilotPolicy": policy_str,
		"bypassSchengen": bypass_val
	}
	
	if is_contraband_mode:
		body["contrabandJobId"] = selected_contract.get("id", "")
	else:
		body["legalContractId"] = selected_contract.get("id", "")
	
	_log("Dispatching truck %s with %s autopilot (Bypass: %s)..." % [truck_id, policy_str, str(bypass_val)], Color(0.925, 0.607, 0.141))
	
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_launch_response.bind(http))
	http.request(
		api_base + "/dispatch/launch",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		JSON.stringify(body)
	)

# ==========================================
# RESPONSE HANDLERS
# ==========================================
func _on_legal_contracts_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Array:
			legal_contracts = []
			for item in data:
				var contract = {
					"id": item.get("id", ""),
					"origin": item.get("origin", ""),
					"destination": item.get("destination", ""),
					"cargoType": item.get("cargoType", ""),
					"distanceKm": float(item.get("distanceKm", 0.0)),
					"payoutCash": float(item.get("payoutLegal", 0.0)),
					"border": false,
					"contractType": item.get("contractType", "SPOT"),
					"remainingQuota": item.get("remainingQuota", null),
					"expiresAt": item.get("expiresAt", null)
				}
				legal_contracts.append(contract)
			_render_contracts()
			_log("Legal contracts loaded.", Color(0.18, 0.803, 0.443))

func _on_contraband_jobs_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Array:
			contraband_jobs = []
			for item in data:
				var job = {
					"id": item.get("id", ""),
					"origin": item.get("origin", ""),
					"destination": item.get("destination", ""),
					"cargoType": item.get("cargoClass", "CONTRABAND"),
					"distanceKm": 350.0,
					"payoutCash": float(item.get("payoutBlack", 0.0)),
					"detectionRisk": float(item.get("riskMultiplier", 1.0)) * 15.0,
					"contractType": item.get("contractType", "SPOT"),
					"remainingQuota": item.get("remainingQuota", null),
					"expiresAt": item.get("expiresAt", null)
				}
				contraband_jobs.append(job)
			_render_contracts()
			_log("Contraband board loaded.", Color(0.607, 0.349, 0.713))

func _on_trucks_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var busy_truck_ids = []
	for r in active_routes:
		var t_id = r.get("truckId", "")
		if not t_id.is_empty():
			busy_truck_ids.append(t_id)

	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		available_trucks = []
		if data and data is Array:
			for garage in data:
				if garage.has("trucks"):
					for truck in garage.trucks:
						if not truck.get("isImpounded", false) and truck.get("activeRoute", null) == null:
							var t_id = truck.get("id", "")
							if not t_id in busy_truck_ids:
								truck["currentCity"] = garage.get("city", "Unknown")
								available_trucks.append(truck)
		
		truck_select_box.clear()
		for i in range(available_trucks.size()):
			var t = available_trucks[i]
			truck_select_box.add_item("[%s] %s (E:%d%%)" % [t.get("currentCity", "?").to_upper(), t.get("model","?"), int(t.get("engineHealth",0))], i)
		
		if available_trucks.is_empty():
			_log("No trucks available for dispatch.", Color(0.901, 0.298, 0.235))
		else:
			_log("%d truck(s) ready for dispatch." % available_trucks.size(), Color(0.18, 0.803, 0.443))
	else:
		# FALLBACK: populate available trucks from GameState.fleet if server is offline
		available_trucks = []
		for truck in GameState.fleet:
			if not truck.get("isImpounded", false) and truck.get("activeRoute", null) == null:
				var t_id = truck.get("id", "")
				if not t_id in busy_truck_ids:
					if not truck.has("currentCity"):
						truck["currentCity"] = "siauliai" # Default fallback city
					if not truck.has("fuel"):
						truck["fuel"] = 100.0
					available_trucks.append(truck)
		
		truck_select_box.clear()
		for i in range(available_trucks.size()):
			var t = available_trucks[i]
			truck_select_box.add_item("[%s] %s (E:%d%%)" % [t.get("currentCity", "?").to_upper(), t.get("model","?"), int(t.get("engineHealth",0))], i)
			
		_log("Offline mode: loaded persistent local fleet fallback.", Color(0.925, 0.607, 0.141))

	_update_surcharge_status()

func _on_active_routes_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Array:
			active_routes = data
			_render_active_routes()

func _on_launch_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if code == 201:
		JuiceEngine.show_splash_text("ROUTE LOCKED", Color(0.925, 0.607, 0.141))
		_log("✓ Route launched! Truck is on the road.", Color(0.18, 0.803, 0.443))
		dispatch_panel.hide()
		selected_contract = {}
		_fetch_active_routes()
		_fetch_trucks()
	else:
		JuiceEngine.show_splash_text("LOCAL ROUTE LOCKED", Color(0.18, 0.803, 0.443))
		# Server offline fallback launch
		_log("⚠ Server Offline. Initializing LOCAL PERSISTENT AUTOPILOT...", Color(0.925, 0.607, 0.141))
		dispatch_panel.hide()
		
		var truck_idx = truck_select_box.get_selected_id()
		if truck_idx >= 0 and truck_idx < available_trucks.size():
			var truck = available_trucks[truck_idx]
			var truck_id = truck.get("id", "")
			
			var mock_route = {
				"truckId": truck_id,
				"isSmuggling": is_contraband_mode,
				"progressPct": 0.0,
				"driverName": "Local Operator",
				"driverFatigue": 15,
				"driverTachoHours": 1.2,
				"driverIsStimulated": false,
				"engineHealth": truck.get("engineHealth", 100),
				"tireWear": truck.get("tireWear", 100),
				"originCity": selected_contract.get("origin", "Tallinn"),
				"destinationCity": selected_contract.get("destination", "Riga"),
				"distanceKm": selected_contract.get("distanceKm", 300.0),
				"payout": selected_contract.get("payoutCash", 1000.0),
				"currentCity": selected_contract.get("origin", "Tallinn")
			}
			
			GameState.active_routes[truck_id] = mock_route
			active_routes.append(mock_route)
			_render_active_routes()
			
			selected_contract = {}
			_start_local_progress_simulation(truck_id)
		else:
			_log("⚠ Launch failed: invalid truck selection.", Color(0.901, 0.298, 0.235))

# ==========================================
# RENDERING
# ==========================================
func _render_contracts() -> void:
	for child in contract_list.get_children():
		child.queue_free()
	
	var contracts = contraband_jobs if is_contraband_mode else legal_contracts
	
	for contract in contracts:
		var card = _build_contract_card(contract)
		contract_list.add_child(card)

func _render_active_routes() -> void:
	for child in active_routes_list.get_children():
		child.queue_free()
	
	if active_routes.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "No active routes. Launch a dispatch to begin."
		empty_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
		empty_lbl.add_theme_font_size_override("font_size", 12)
		active_routes_list.add_child(empty_lbl)
		return
	
	for route in active_routes:
		var card = _build_route_card(route)
		active_routes_list.add_child(card)

func _get_border_crossings(origin: String, dest: String) -> int:
	var belarus = ["Minsk", "Brest", "Grodno", "Mogilev", "Gomel", "Vitebsk"]
	var is_origin_by = origin in belarus
	var is_dest_by = dest in belarus
	if is_origin_by != is_dest_by:
		return 1
	return 0

func _build_contract_card(contract: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.04, 0.05, 0.07, 0.95)
	
	var btn_color = Color(0.607, 0.349, 0.713) if is_contraband_mode else Color(0.18, 0.803, 0.443)
	style.border_color = btn_color * 0.6
	style.border_width_left = 3
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	panel.add_child(vbox)
	
	# Route header
	var header_row = HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 10)
	vbox.add_child(header_row)
	
	var header_lbl = Label.new()
	header_lbl.text = "🏁  %s ➔ %s" % [contract.get("origin", "?"), contract.get("destination", "?")]
	header_lbl.add_theme_color_override("font_color", Color.WHITE)
	header_lbl.add_theme_font_size_override("font_size", 14)
	header_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(header_lbl)
	
	# Badge for contract type
	var contract_type = contract.get("contractType", "SPOT")
	var badge = _create_badge_capsule(contract_type, Color(0.1, 0.1, 0.12, 0.8), btn_color * 0.8)
	header_row.add_child(badge)
	
	# Details grid
	var details_grid = GridContainer.new()
	details_grid.columns = 2
	details_grid.add_theme_constant_override("h_separation", 24)
	details_grid.add_theme_constant_override("v_separation", 4)
	vbox.add_child(details_grid)
	
	var dist_val = int(contract.get("distanceKm", 0))
	var hours = float(dist_val) / 80.0
	var h_int = int(hours)
	var m_int = int((hours - h_int) * 60)
	var time_str = "%dh %dm" % [h_int, m_int]
	
	var fuel_liters = dist_val * 0.35
	var fuel_cost = fuel_liters * 1.50
	
	var border_count = _get_border_crossings(contract.get("origin", ""), contract.get("destination", ""))
	
	# Column 1
	var col1_v = VBoxContainer.new()
	details_grid.add_child(col1_v)
	
	var cargo_lbl = Label.new()
	cargo_lbl.text = "📦 Cargo: %s" % contract.get("cargoType", "COMMODITIES")
	cargo_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	cargo_lbl.add_theme_font_size_override("font_size", 11)
	col1_v.add_child(cargo_lbl)
	
	var dist_lbl = Label.new()
	dist_lbl.text = "🗺️ Distance: %d Km (%s)" % [dist_val, time_str]
	dist_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	dist_lbl.add_theme_font_size_override("font_size", 11)
	col1_v.add_child(dist_lbl)
	
	# Column 2
	var col2_v = VBoxContainer.new()
	details_grid.add_child(col2_v)
	
	var fuel_lbl = Label.new()
	fuel_lbl.text = "⛽ Est. Fuel: $%.0f (%d L)" % [fuel_cost, int(fuel_liters)]
	fuel_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	fuel_lbl.add_theme_font_size_override("font_size", 11)
	col2_v.add_child(fuel_lbl)
	
	var border_lbl = Label.new()
	border_lbl.text = "🛂 Customs Checkpoints: %d" % border_count
	border_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8) if border_count == 0 else Color(1.0, 0.6, 0.1))
	border_lbl.add_theme_font_size_override("font_size", 11)
	col2_v.add_child(border_lbl)
	
	# Risk and Payout Row
	var bottom_info = HBoxContainer.new()
	bottom_info.add_theme_constant_override("separation", 16)
	vbox.add_child(bottom_info)
	
	# Risk Rating Badge
	var risk_badge: PanelContainer = null
	if is_contraband_mode:
		var risk_val = int(contract.get("detectionRisk", 0))
		if risk_val < 10:
			risk_badge = _create_badge_capsule("SAFE RISK", Color(0.05, 0.3, 0.1, 0.2), Color(0.2, 0.9, 0.45))
		elif risk_val < 30:
			risk_badge = _create_badge_capsule("MODERATE RISK", Color(0.3, 0.2, 0.05, 0.2), Color(1.0, 0.8, 0.2))
		elif risk_val < 60:
			risk_badge = _create_badge_capsule("HIGH RISK", Color(0.35, 0.15, 0.05, 0.2), Color(1.0, 0.55, 0.1))
		else:
			risk_badge = _create_badge_capsule("EXTREME RISK 💀", Color(0.4, 0.05, 0.05, 0.2), Color(1.0, 0.2, 0.2))
	else:
		risk_badge = _create_badge_capsule("SAFE ROUTE", Color(0.05, 0.3, 0.1, 0.2), Color(0.2, 0.9, 0.45))
	
	bottom_info.add_child(risk_badge)
	
	# Payout split
	var pay_lbl = Label.new()
	var payout = int(contract.get("payoutCash", 0))
	if is_contraband_mode:
		pay_lbl.text = "Payout: $0 Clean | $%d Dirty" % payout
		pay_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	else:
		pay_lbl.text = "Payout: $%d Clean | $0 Dirty" % payout
		pay_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))
	pay_lbl.add_theme_font_size_override("font_size", 12)
	pay_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom_info.add_child(pay_lbl)
	
	# Select Button
	var btn = Button.new()
	btn.text = "▶ SELECT"
	btn.custom_minimum_size = Vector2(100, 28)
	GlobalThemeManager.apply_btn_style(btn, btn_color)
	btn.pressed.connect(_select_contract.bind(contract))
	bottom_info.add_child(btn)
	
	return panel

func _build_route_card(route: Dictionary) -> PanelContainer:
	var truck_id = route.get("truckId", "?")
	var is_smuggle = route.get("isSmuggling", false)
	var pct = int(float(route.get("progressPct", 0)))
	var driver_name = route.get("driverName", "")
	if driver_name == "" or driver_name == null:
		var d_obj = route.get("driver", null)
		if d_obj and d_obj is Dictionary:
			driver_name = d_obj.get("name", "Unknown Driver")
		else:
			driver_name = "Unknown Driver"
			
	var fatigue = int(route.get("driverFatigue", 0))
	var tacho = float(route.get("driverTachoHours", 0.0))
	var stimulated = bool(route.get("driverIsStimulated", false))
	var engine_hp = int(route.get("engineHealth", 100))
	var tire_hp = int(route.get("tireWear", 100))
	var current_city = route.get("currentCity", "En Route")
	
	var origin = route.get("originCity", "")
	if origin == "" or origin == null:
		origin = route.get("origin", "")
	if origin == "" or origin == null:
		origin = route.get("currentCity", "?")
		
	var dest = route.get("destinationCity", "")
	if dest == "" or dest == null:
		dest = route.get("destination", "?")
	
	var cosmetic_hp = 100
	if route.has("cosmeticHealth"):
		cosmetic_hp = int(route.get("cosmeticHealth", 100))
	elif route.has("truck") and route.get("truck") is Dictionary:
		cosmetic_hp = int(route.get("truck", {}).get("cosmeticHealth", 100))
		
	var weather = route.get("currentWeather", "CLEAR")

	var panel = PanelContainer.new()
	panel.name = "route_" + truck_id
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.045, 0.05, 0.07, 0.95)
	var border_color = Color(0.607, 0.349, 0.713, 0.6) if is_smuggle else Color(0.925, 0.607, 0.141, 0.4)
	style.border_color = border_color
	style.border_width_left = 4
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	panel.add_child(vbox)

	# Header row
	var header_row = HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 10)
	vbox.add_child(header_row)

	var route_icon = Label.new()
	route_icon.text = "💀 SMUGGLE" if is_smuggle else "🚛 LEGAL"
	route_icon.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713) if is_smuggle else Color(0.18, 0.803, 0.443))
	route_icon.add_theme_font_size_override("font_size", 12)
	header_row.add_child(route_icon)

	var route_lbl = Label.new()
	route_lbl.text = "%s → %s" % [origin, dest]
	route_lbl.add_theme_color_override("font_color", Color.WHITE)
	route_lbl.add_theme_font_size_override("font_size", 13)
	route_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(route_lbl)

	# Weather Badge
	var w_icon = "☀️"
	if weather == "RAIN": w_icon = "🌧️"
	elif weather == "ICE_STORM": w_icon = "❄️"
	elif weather == "THICK_FOG": w_icon = "🌫️"
	var w_badge = _create_badge_capsule(w_icon + " " + weather.replace("_", " "), Color(0.1, 0.1, 0.12, 0.8), Color(0.3, 0.8, 1.0))
	header_row.add_child(w_badge)

	# ETA & Location Line
	var loc_row = HBoxContainer.new()
	vbox.add_child(loc_row)
	
	var city_lbl = Label.new()
	city_lbl.text = "📍 Position: " + current_city
	city_lbl.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	city_lbl.add_theme_font_size_override("font_size", 11)
	city_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	loc_row.add_child(city_lbl)

	var eta_lbl = Label.new()
	var eta_msg = "ETA: --:--"
	if route.has("eta") and route.eta != null:
		var eta_unix = Time.get_unix_time_from_datetime_string(route.eta)
		var remaining_sec = eta_unix - GameState.simulated_time_unix
		if remaining_sec > 0:
			var hours_left = int(remaining_sec / 3600)
			var mins_left = int((int(remaining_sec) % 3600) / 60)
			eta_msg = "ETA: %dh %dm" % [hours_left, mins_left]
		else:
			eta_msg = "UNLOADING..."
	eta_lbl.text = eta_msg
	eta_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5))
	eta_lbl.add_theme_font_size_override("font_size", 11)
	loc_row.add_child(eta_lbl)

	# Custom Mini-Map line
	var map_hbox = HBoxContainer.new()
	map_hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	map_hbox.add_theme_constant_override("separation", 10)
	vbox.add_child(map_hbox)
	
	var o_lbl = Label.new()
	o_lbl.text = origin.substr(0, 4).to_upper()
	o_lbl.add_theme_font_size_override("font_size", 10)
	o_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	map_hbox.add_child(o_lbl)
	
	var p_bar = ProgressBar.new()
	p_bar.value = pct
	p_bar.min_value = 0
	p_bar.max_value = 100
	p_bar.show_percentage = false
	p_bar.custom_minimum_size = Vector2(0, 6)
	p_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	
	var sb_bg = StyleBoxFlat.new()
	sb_bg.bg_color = Color(0.1, 0.1, 0.15, 0.8)
	sb_bg.set_corner_radius_all(3)
	p_bar.add_theme_stylebox_override("background", sb_bg)
	
	var sb_fg = StyleBoxFlat.new()
	sb_fg.bg_color = border_color
	sb_fg.set_corner_radius_all(3)
	p_bar.add_theme_stylebox_override("fill", sb_fg)
	map_hbox.add_child(p_bar)
	
	var d_lbl = Label.new()
	d_lbl.text = dest.substr(0, 4).to_upper()
	d_lbl.add_theme_font_size_override("font_size", 10)
	d_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	map_hbox.add_child(d_lbl)

	# Stats grid (Fuel, Fatigue, Health)
	var stats_row = HBoxContainer.new()
	stats_row.add_theme_constant_override("separation", 14)
	vbox.add_child(stats_row)

	# Fuel gauge
	var fuel_pct = clamp(100 - int(pct * 0.6), 10, 100)
	var fuel_vbox = VBoxContainer.new()
	fuel_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stats_row.add_child(fuel_vbox)
	var fuel_title = Label.new()
	fuel_title.text = "⛽ FUEL: %d%%" % fuel_pct
	fuel_title.add_theme_font_size_override("font_size", 9)
	fuel_title.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	fuel_vbox.add_child(fuel_title)
	var fuel_progress = ProgressBar.new()
	fuel_progress.value = fuel_pct
	fuel_progress.show_percentage = false
	fuel_progress.custom_minimum_size = Vector2(0, 6)
	var sb_fuel = StyleBoxFlat.new()
	sb_fuel.bg_color = Color(0.2, 0.8, 0.3) if fuel_pct > 25 else Color(0.9, 0.3, 0.2)
	sb_fuel.set_corner_radius_all(3)
	fuel_progress.add_theme_stylebox_override("fill", sb_fuel)
	fuel_progress.add_theme_stylebox_override("background", sb_bg)
	fuel_vbox.add_child(fuel_progress)

	# Fatigue
	var fat_vbox = VBoxContainer.new()
	fat_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stats_row.add_child(fat_vbox)
	var fat_title = Label.new()
	fat_title.text = "😴 FATIGUE: %d%%" % fatigue
	fat_title.add_theme_font_size_override("font_size", 9)
	fat_title.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	fat_vbox.add_child(fat_title)
	var fat_progress = ProgressBar.new()
	fat_progress.value = fatigue
	fat_progress.show_percentage = false
	fat_progress.custom_minimum_size = Vector2(0, 6)
	var sb_fat = StyleBoxFlat.new()
	sb_fat.bg_color = Color(0.9, 0.3, 0.2) if fatigue > 75 else Color(0.2, 0.8, 0.3)
	sb_fat.set_corner_radius_all(3)
	fat_progress.add_theme_stylebox_override("fill", sb_fat)
	fat_progress.add_theme_stylebox_override("background", sb_bg)
	fat_vbox.add_child(fat_progress)

	# Engine Health
	var eng_vbox = VBoxContainer.new()
	eng_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stats_row.add_child(eng_vbox)
	var eng_title = Label.new()
	eng_title.text = "⚙️ ENGINE: %d%%" % engine_hp
	eng_title.add_theme_font_size_override("font_size", 9)
	eng_title.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	eng_vbox.add_child(eng_title)
	var eng_progress = ProgressBar.new()
	eng_progress.value = engine_hp
	eng_progress.show_percentage = false
	eng_progress.custom_minimum_size = Vector2(0, 6)
	var sb_eng = StyleBoxFlat.new()
	sb_eng.bg_color = Color(0.2, 0.8, 0.3) if engine_hp > 30 else Color(0.9, 0.3, 0.2)
	sb_eng.set_corner_radius_all(3)
	eng_progress.add_theme_stylebox_override("fill", sb_eng)
	eng_progress.add_theme_stylebox_override("background", sb_bg)
	eng_vbox.add_child(eng_progress)

	# Clicking card expands detail (if clickable signal connected, we can connect on panel gui_input)
	panel.gui_input.connect(func(event):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			# Signal or toggle route view details in panel
			pass
	)

	return panel

func _add_stat_bar(parent: Control, label_text: String, val: int, max_val: int, fill_color: Color) -> void:
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var lbl = Label.new()
	lbl.text = label_text
	lbl.custom_minimum_size.x = 65
	lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	lbl.add_theme_font_size_override("font_size", 10)
	row.add_child(lbl)
	var bar = _make_bar_bg(fill_color, val, max_val)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.name = "Bar"
	row.add_child(bar)
	var val_lbl = Label.new()
	val_lbl.name = "ValLbl"
	val_lbl.text = "%d%%" % val
	val_lbl.custom_minimum_size.x = 30
	val_lbl.add_theme_color_override("font_color", fill_color)
	val_lbl.add_theme_font_size_override("font_size", 10)
	row.add_child(val_lbl)
	parent.add_child(row)

func _make_bar_bg(fill_color: Color, val: int, max_val: int) -> Control:
	var bg = Control.new()
	bg.custom_minimum_size = Vector2(0, 6)
	var bg_rect = ColorRect.new()
	bg_rect.color = Color(0.1, 0.1, 0.12)
	bg_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.add_child(bg_rect)
	var fill = ColorRect.new()
	var pct = clampf(float(val) / float(max_val), 0.0, 1.0)
	fill.color = fill_color
	fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	fill.anchor_right = pct
	bg.add_child(fill)
	return bg

# ==========================================
# SELECTION & DISPATCH PANEL
# ==========================================
func _select_contract(contract: Dictionary) -> void:
	JuiceEngine.play_sound("click")
	selected_contract = contract
	dispatch_panel.show()
	JuiceEngine.tween_slide_in(dispatch_panel, Vector2(50, 0))
	_update_surcharge_status()

func _on_truck_selected(_idx: int) -> void:
	_update_surcharge_status()

func _update_surcharge_status() -> void:
	if selected_contract.is_empty():
		return
		
	var origin_city = cities_data.get(selected_contract.get("origin", "").to_lower(), {})
	var dest_city = cities_data.get(selected_contract.get("destination", "").to_lower(), {})
	
	var is_cross_country = false
	if not origin_city.is_empty() and not dest_city.is_empty():
		var origin_country = origin_city.get("country", "")
		var dest_country = dest_city.get("country", "")
		if origin_country != dest_country:
			is_cross_country = true
			
	var truck_idx = truck_select_box.get_selected_id()
	var requires_refuel = false
	var truck_range = 0.0
	
	if truck_idx >= 0 and truck_idx < available_trucks.size():
		var truck = available_trucks[truck_idx]
		var model = truck.get("model", "").to_lower()
		var is_ev = "ev" in model or "electric" in model
		var consumption_rate = 1.5 if is_ev else 0.35
		
		var fuel_capacity = float(truck.get("fuelCapacity", 400.0))
		var fuel_mod = truck.get("fuelTankMod", "STOCK")
		var truck_factor = 1.1 if fuel_mod == "CHASSIS_CAVITY" else 1.0
		
		var driver_factor = 1.0
		var driver = truck.get("driver", null)
		if driver and driver is Dictionary:
			var trait = driver.get("trait", "BALANCED")
			if trait == "LEAD_FOOT":
				driver_factor = 1.1
				
		var weight_factor = 1.0
		var cargo_type = selected_contract.get("cargoType", "")
		if cargo_type != "":
			match cargo_type:
				"STEEL_COILS": weight_factor = 1.5
				"TIMBER": weight_factor = 1.3
				"AGRICULTURAL_MACHINERY": weight_factor = 1.2
				"DAIRY_PRODUCTS": weight_factor = 1.1
				"PHARMACEUTICALS": weight_factor = 1.0
				"ELECTRONICS": weight_factor = 0.9
				
		if cargo_type.begins_with("CLASS_") or (is_contraband_mode and cargo_type != ""):
			var cargo_class = cargo_type
			if not cargo_class.begins_with("CLASS_"):
				cargo_class = selected_contract.get("cargoClass", "CLASS_B")
			match cargo_class:
				"CLASS_C": weight_factor = 1.4
				"CLASS_B": weight_factor = 1.1
				"CLASS_A": weight_factor = 0.9
				
		var total_modifier = truck_factor * driver_factor * weight_factor
		truck_range = fuel_capacity / (consumption_rate * total_modifier)
		
		var dist = float(selected_contract.get("distanceKm", 350.0))
		if dist > truck_range:
			requires_refuel = true
			
	var warning_text = ""
	selected_contract_is_cross_region = false
	if is_cross_country and requires_refuel:
		selected_contract_is_cross_region = true
		warning_text = "\n\n⚠️ CROSS-REGION SURCHARGE APPLIED:\n+35% fuel, +2h time, +15% wear (Requires refueling en-route)"
		_log("Cross-region route (requires refueling). Surcharges will apply.", Color(0.901, 0.298, 0.235))
	elif is_cross_country:
		warning_text = "\n\nℹ️ CROSS-REGION ROUTE (No refueling required; surcharge inactive)"
		_log("Cross-region route (no refueling). Surcharge is inactive.", Color(0.18, 0.803, 0.443))
	else:
		if requires_refuel:
			warning_text = "\n\nℹ️ Note: Route requires refueling en-route (No cross-region surcharge)"
			_log("Route requires refueling (no border crossing).", Color(0.925, 0.607, 0.141))
		else:
			_log("Contract selected. Choose truck and launch.", Color(0.18, 0.803, 0.443))
			
	var display_range_str = "N/A"
	if truck_range > 0:
		display_range_str = str(int(truck_range)) + " km"
		
	selected_contract_lbl.text = "%s → %s\n%s\n$%d payout (Dist: %d km / Truck Range: %s)%s" % [
		selected_contract.get("origin", "?"),
		selected_contract.get("destination", "?"),
		selected_contract.get("cargoType", "?"),
		int(selected_contract.get("payoutCash", 0)),
		int(selected_contract.get("distanceKm", 0)),
		display_range_str,
		warning_text
	]

func _show_legal_tab() -> void:
	is_contraband_mode = false
	tab_legal_btn.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))
	tab_contra_btn.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
	_render_contracts()

func _show_contra_tab() -> void:
	is_contraband_mode = true
	tab_contra_btn.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	tab_legal_btn.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
	_render_contracts()

func _on_launch_dispatch() -> void:
	JuiceEngine.play_sound("heavy")
	JuiceEngine.pop_attention(dispatch_panel)
	_launch_dispatch()

# ==========================================
# WEBSOCKET LIVE UPDATES
# ==========================================
func _on_route_progress(payload: Dictionary) -> void:
	# Smoothly update the live tachograph arc
	var truck_id = payload.get("truckId", "")
	live_progress = float(payload.get("progressPct", 0.0)) / 100.0
	
	# Find the existing route card and rebuild it in-place with fresh telemetry
	for card in active_routes_list.get_children():
		if card.name == "route_" + truck_id:
			var vbox = card.get_child(0)
			if vbox:
				for row in vbox.get_children():
					if row.get_child_count() > 0 and row.get_child(0) is Label and row.get_child(0).text == "ROUTE":
						var bar = row.get_node_or_null("Bar")
						var val_lbl = row.get_node_or_null("ValLbl")
						if bar and val_lbl:
							val_lbl.text = "%d%%" % int(payload.get("progressPct", 0.0))
							var fill = bar.get_child(1) # The ColorRect fill
							var pct = clampf(float(payload.get("progressPct", 0.0)) / 100.0, 0.0, 1.0)
							var tween = create_tween()
							tween.tween_property(fill, "anchor_right", pct, 0.5).set_ease(Tween.EASE_OUT)
			
			# Also merge cached API data into local active_routes so it persists
			for route in active_routes:
				if route.get("truckId", "") == truck_id:
					route.merge(payload, true)
					break
			return
	
	# Card not found — full re-render on first progress tick for a new route
	_fetch_active_routes()

func _on_route_completed(payload: Dictionary) -> void:
	live_progress = 0.0
	var truck_id = payload.get("truckId", "")
	
	# 1. Lookup origin/destination from active route before removing
	var origin = payload.get("originCity", "")
	var dest = payload.get("destinationCity", "")
	var distance = 200.0
	
	for route in active_routes:
		if route.get("truckId") == truck_id:
			origin = route.get("originCity", origin)
			dest = route.get("destinationCity", dest)
			distance = float(route.get("distanceKm", distance))
			break
			
	var is_cross_region_completed = false
	var origin_city = cities_data.get(origin.to_lower(), {})
	var dest_city = cities_data.get(dest.to_lower(), {})
	if not origin_city.is_empty() and not dest_city.is_empty():
		if origin_city.get("country", "") != dest_city.get("country", ""):
			is_cross_region_completed = true
			
	# 2. Erase from active routes
	GameState.active_routes.erase(truck_id)
	var clean_routes = []
	for route in active_routes:
		if route.get("truckId") != truck_id:
			clean_routes.append(route)
	active_routes = clean_routes
	
	# 3. Apply Multipliers
	var fuel_multiplier = 1.35 if is_cross_region_completed else 1.0
	var wear_multiplier = 1.15 if is_cross_region_completed else 1.0
	
	# 4. Consume Stats in GameState.fleet
	var found_truck = false
	for truck in GameState.fleet:
		if truck.get("id") == truck_id:
			found_truck = true
			if not truck.has("fuel"):
				truck["fuel"] = 100.0
				
			var fuel_used = (15.0 + 0.05 * distance) * fuel_multiplier
			truck["fuel"] = clamp(float(truck["fuel"]) - fuel_used, 0.0, 100.0)
			
			var tire_damage = randi_range(4, 10) * wear_multiplier
			truck["tireWear"] = clamp(int(truck["tireWear"]) - int(tire_damage), 0, 100)
			
			var engine_damage = randi_range(3, 8) * wear_multiplier
			truck["engineHealth"] = clamp(int(truck["engineHealth"]) - int(engine_damage), 0, 100)
			
			_log("✓ ASSET UPDATE: Fuel consumed: %d%%, engine health decreased, tire wear applied." % int(fuel_used), Color(0.18, 0.803, 0.443))
			break
			
	# 5. Payout cash update for local mock completion
	var payout = float(payload.get("payout", payload.get("payoutCash", 0.0)))
	var is_smuggle = payload.get("isSmuggling", false)
	if payout > 0.0:
		if is_smuggle:
			GameState.update_balances(0.0, payout)
		else:
			GameState.update_balances(payout, 0.0)
			
	_log("✓ DELIVERY CONFIRMED: %s payout credited." % ["$" + str(int(payout))], Color(0.18, 0.803, 0.443))
	_fetch_active_routes()
	_fetch_trucks()

func _on_ws_message(packet: Dictionary) -> void:
	match packet.get("type", ""):
		"dispatch:autopilot_resolution":
			var payload = packet.get("payload", {})
			var msg = payload.get("message", "Autopilot resolved an event.")
			var is_success = payload.get("success", true)
			var log_color = Color(0.18, 0.803, 0.443) if is_success else Color(0.901, 0.298, 0.235)
			_log("🤖 AUTOPILOT: " + msg, log_color)
			_fetch_active_routes()
			_fetch_trucks()
		"alert:weigh_station_fine":
			var payload = packet.get("payload", {})
			_log("🏛 TACHO FINE: $%d — Driver exceeded Schengen limits!" % int(payload.get("fine", 0)), Color(0.925, 0.607, 0.141))
		"alert:engine_breakdown":
			_log("⚙ ENGINE FAILURE! Emergency roadside repair required.", Color(1.0, 0.55, 0.1))
			_fetch_active_routes()
			_fetch_trucks()
		"alert:driver_wreck":
			_log("💥 MICROSLEEP CRASH! Driver fell asleep. Route aborted.", Color(0.901, 0.298, 0.235))
			_fetch_active_routes()
			_fetch_trucks()
		"alert:driver_snitched":
			_log("🐀 BETRAYAL! Driver snitched. Truck impounded.", Color(0.901, 0.298, 0.235))
			_fetch_active_routes()
			_fetch_trucks()

# ==========================================
# HELPERS
# ==========================================
func _refresh_header() -> void:
	balance_lbl.text = "$%s CLEAN" % String.num(GameState.legal_balance, 2)
	dirty_lbl.text = "$%s DIRTY" % String.num(GameState.black_market_balance, 2)
	heat_lbl.text = "HEAT: %d%%" % GameState.police_heat
	_set_heat_color()

func _on_balances_updated(legal: float, dirty: float) -> void:
	balance_lbl.text = "$%s CLEAN" % String.num(legal, 2)
	dirty_lbl.text = "$%s DIRTY" % String.num(dirty, 2)

func _on_reputation_updated(score: int, heat: int) -> void:
	heat_lbl.text = "HEAT: %d%%" % heat
	_set_heat_color()

func _set_heat_color() -> void:
	var heat = GameState.police_heat
	if heat > 60:
		heat_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	elif heat > 30:
		heat_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	else:
		heat_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))

func _log(text: String, color: Color) -> void:
	console_lbl.text = text
	console_lbl.add_theme_color_override("font_color", color)

func _on_back() -> void:
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _load_cities_data() -> void:
	var file = FileAccess.open("res://resources/cities.json", FileAccess.READ)
	if not file:
		_log("System Error: resources/cities.json not found.", Color(0.901, 0.298, 0.235))
		return
		
	var json_str = file.get_as_text()
	var json = JSON.parse_string(json_str)
	if not json or not json.has("cities"):
		_log("System Error: Corrupt route network dataset.", Color(0.901, 0.298, 0.235))
		return
		
	cities_data = json.cities

func _start_local_progress_simulation(truck_id: String) -> void:
	local_simulating_trucks[truck_id] = 0.0

func _apply_theme() -> void:
	GlobalThemeManager.apply_glass(%DispatchPanel, "intense")
	GlobalThemeManager.apply_btn_style(back_btn, Color(0.9, 0.3, 0.2))
	GlobalThemeManager.apply_btn_style(launch_btn, Color(0.925, 0.607, 0.141))
	GlobalThemeManager.apply_btn_style(tab_legal_btn, Color(0.18, 0.803, 0.443))
	GlobalThemeManager.apply_btn_style(tab_contra_btn, Color(0.607, 0.349, 0.713))
	
	if has_node("%LiveTelemetryPanel"):
		GlobalThemeManager.apply_glass(%LiveTelemetryPanel, "standard")
		
	if has_node("%TruckSelectBox"):
		var opt_style = StyleBoxFlat.new()
		opt_style.bg_color = Color(0.02, 0.02, 0.03, 0.9)
		opt_style.border_color = Color(0.925, 0.607, 0.141, 0.5)
		opt_style.border_width_all = 1
		opt_style.set_corner_radius_all(2)
		opt_style.content_margin_left = 8
		opt_style.content_margin_right = 8
		opt_style.content_margin_top = 4
		opt_style.content_margin_bottom = 4
		%TruckSelectBox.add_theme_stylebox_override("normal", opt_style)
		%TruckSelectBox.add_theme_stylebox_override("hover", opt_style)
		%TruckSelectBox.add_theme_stylebox_override("pressed", opt_style)
		%TruckSelectBox.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.9))
		%TruckSelectBox.add_theme_font_size_override("font_size", 11)

# ==========================================
# BORDER INSPECTION MINI-GAME UI
# ==========================================
var active_border_panel: Control = null

func _on_border_inspection(payload: Dictionary) -> void:
	if active_border_panel and is_instance_valid(active_border_panel):
		active_border_panel.queue_free()
		
	var route_id = payload.get("routeId", "")
	var truck_id = payload.get("truckId", "")
	var contraband_class = payload.get("contrabandClass", "UNKNOWN")
	var origin = payload.get("origin", "Border Crossing")
	
	var overlay = CanvasLayer.new()
	overlay.layer = 100
	add_child(overlay)
	active_border_panel = overlay
	
	var dim = ColorRect.new()
	dim.color = Color(0, 0, 0, 0.8)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(dim)
	
	var box = PanelContainer.new()
	box.position = Vector2(300, 200)
	box.size = Vector2(600, 350)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.05, 0.05, 0.95)
	style.border_color = Color(0.9, 0.2, 0.2, 1.0)
	style.set_border_width_all(3)
	style.set_corner_radius_all(10)
	box.add_theme_stylebox_override("panel", style)
	overlay.add_child(box)
	
	var vbox = VBoxContainer.new()
	vbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 20)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_child(vbox)
	
	var title = Label.new()
	title.text = "⚠ CUSTOMS INSPECTION ⚠"
	title.add_theme_color_override("font_color", Color(0.9, 0.2, 0.2, 1.0))
	title.add_theme_font_size_override("font_size", 24)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(title)
	
	var desc = Label.new()
	desc.text = "Truck at %s has been stopped for random inspection.\nCargo detected: Class %s Contraband." % [origin, contraband_class]
	desc.add_theme_color_override("font_color", Color(0.8, 0.7, 0.7, 1.0))
	desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(desc)
	
	var hbox = HBoxContainer.new()
	hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	hbox.add_theme_constant_override("separation", 30)
	vbox.add_child(hbox)
	
	var btn_clear = Button.new()
	btn_clear.text = "SUBMIT TO SCAN\n(Rely on Shielding)"
	btn_clear.custom_minimum_size = Vector2(160, 60)
	btn_clear.pressed.connect(func(): NetworkManager.trigger_border_action(truck_id, "CLEARANCE"))
	hbox.add_child(btn_clear)
	
	var bribe_vbox = VBoxContainer.new()
	bribe_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	bribe_vbox.add_theme_constant_override("separation", 5)
	
	var bribe_slider = HSlider.new()
	bribe_slider.min_value = 1000
	bribe_slider.max_value = min(15000, GameState.legal_balance)
	if bribe_slider.max_value < 1000:
		bribe_slider.max_value = 1000
	bribe_slider.step = 250
	bribe_slider.value = min(5000, bribe_slider.max_value)
	bribe_slider.custom_minimum_size = Vector2(180, 20)
	bribe_vbox.add_child(bribe_slider)
	
	var chance_lbl = Label.new()
	chance_lbl.add_theme_font_size_override("font_size", 10)
	chance_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	bribe_vbox.add_child(chance_lbl)
	
	var btn_bribe = Button.new()
	btn_bribe.custom_minimum_size = Vector2(180, 45)
	bribe_vbox.add_child(btn_bribe)
	hbox.add_child(bribe_vbox)
	
	var active_route_obj = null
	for r in active_routes:
		if r.get("truckId") == truck_id:
			active_route_obj = r
			break
			
	var driver_charisma = 5
	var driver_loyalty = 50
	var payout_black = 10000.0
	if active_route_obj:
		var d_obj = active_route_obj.get("driver", {})
		if d_obj:
			driver_charisma = d_obj.get("charisma", 5)
			driver_loyalty = d_obj.get("loyalty", 50)
		var job_obj = active_route_obj.get("contrabandJob", {})
		if job_obj:
			payout_black = float(job_obj.get("payoutBlack", 10000.0))
			
	var recalculate_bribe_chance = func(bribe_val: float) -> void:
		var max_bribe_scale = max(1000.0, payout_black * 0.25)
		var bribe_weight = clamp((bribe_val / max_bribe_scale) * 50.0, 0.0, 50.0)
		var charisma_weight = driver_charisma * 1.5
		var heat_weight = GameState.police_heat * 0.3
		var chance = 20.0 + bribe_weight + charisma_weight - heat_weight
		if driver_loyalty < 40:
			chance -= 15.0
		chance = clamp(chance, 5.0, 90.0)
		chance_lbl.text = "Bribe: $%d | Success: %d%%" % [int(bribe_val), int(chance)]
		btn_bribe.disabled = GameState.legal_balance < bribe_val
		if btn_bribe.disabled:
			btn_bribe.text = "INSUFFICIENT FUNDS"
		else:
			btn_bribe.text = "EXECUTE BRIBE\n($%d Clean)" % int(bribe_val)
			
	bribe_slider.value_changed.connect(recalculate_bribe_chance)
	recalculate_bribe_chance.call(bribe_slider.value)
	
	btn_bribe.pressed.connect(func(): NetworkManager.trigger_border_action(truck_id, "BRIBE", bribe_slider.value))
	
	var btn_run = Button.new()
	btn_run.text = "RUN BARRICADE\n(High Risk)"
	btn_run.custom_minimum_size = Vector2(160, 60)
	btn_run.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	btn_run.pressed.connect(func(): NetworkManager.trigger_border_action(truck_id, "RUN"))
	hbox.add_child(btn_run)

func _on_border_resolved(type: String, payload: Dictionary) -> void:
	if active_border_panel and is_instance_valid(active_border_panel):
		active_border_panel.queue_free()
		active_border_panel = null
		
	# Re-fetch routes to update state
	_fetch_active_routes()

func _create_badge_capsule(text: String, bg_color: Color, border_color: Color) -> PanelContainer:
	var badge = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(1)
	style.set_corner_radius_all(10) # Rounded capsule
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 2
	style.content_margin_bottom = 2
	badge.add_theme_stylebox_override("panel", style)
	
	var lbl = Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 9)
	lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	badge.add_child(lbl)
	return badge

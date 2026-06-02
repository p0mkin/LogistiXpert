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
var clock_lbl: Label = null

func _ready() -> void:
	_apply_theme()
	player_lbl.text = GameState.username.to_upper()
	_refresh_header()
	
	clock_lbl = Label.new()
	clock_lbl.name = "ClockLabel"
	clock_lbl.add_theme_font_size_override("font_size", 12)
	clock_lbl.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443, 0.85))
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
	
	var dispatch_inner = %DispatchPanel.get_node("DispatchInner")
	var launch_idx = %LaunchBtn.get_index()
	dispatch_inner.add_child(policy_lbl)
	dispatch_inner.move_child(policy_lbl, launch_idx)
	dispatch_inner.add_child(autopilot_policy_box)
	dispatch_inner.move_child(autopilot_policy_box, launch_idx + 1)
	
	_fetch_contracts()
	_fetch_active_routes()
	_fetch_trucks()
	
	set_process(true)

func _process(delta: float) -> void:
	tacho_anim_time += delta
	if clock_lbl and is_instance_valid(clock_lbl):
		clock_lbl.text = "📅 " + GameState.get_simulated_time_string()
	queue_redraw()  # For tachograph arc animation

func _draw() -> void:
	# Animated tachograph sweep arc on the bottom-right corner
	var center = Vector2(get_viewport_rect().size.x - 80, get_viewport_rect().size.y - 80)
	var radius = 55.0
	
	# Outer ring
	draw_arc(center, radius, deg_to_rad(140), deg_to_rad(400), 48, Color(0.18, 0.803, 0.443, 0.1), 2.0)
	
	# Animated sweep needle based on live_progress
	var sweep_angle = lerp(140.0, 400.0, live_progress)
	draw_arc(center, radius, deg_to_rad(140), deg_to_rad(sweep_angle), 32, Color(0.18, 0.803, 0.443, 0.6), 3.0)
	
	# Center dot
	draw_circle(center, 5, Color(0.18, 0.803, 0.443, 0.8))
	
	# Tick marks around dial (0-10h markers)
	for i in range(11):
		var angle = deg_to_rad(lerp(140.0, 400.0, float(i) / 10.0))
		var inner = center + Vector2(cos(angle), sin(angle)) * (radius - 8)
		var outer = center + Vector2(cos(angle), sin(angle)) * radius
		var tick_color = Color(0.18, 0.803, 0.443, 0.4) if i < 10 else Color(0.901, 0.298, 0.235, 0.8)
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
		
	var body: Dictionary = {
		"truckId": truck_id,
		"autopilotPolicy": policy_str
	}
	
	if is_contraband_mode:
		body["contrabandJobId"] = selected_contract.get("id", "")
	else:
		body["legalContractId"] = selected_contract.get("id", "")
	
	_log("Dispatching truck %s with %s autopilot..." % [truck_id, policy_str], Color(0.925, 0.607, 0.141))
	
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
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		available_trucks = []
		if data and data is Array:
			for garage in data:
				if garage.has("trucks"):
					for truck in garage.trucks:
						if not truck.get("isImpounded", false) and truck.get("activeRoute", null) == null:
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
		_log("✓ Route launched! Truck is on the road.", Color(0.18, 0.803, 0.443))
		dispatch_panel.hide()
		selected_contract = {}
		_fetch_active_routes()
		_fetch_trucks()
	else:
		var msg = data.get("message", "Unknown error.")
		_log("⚠ Dispatch failed: " + msg, Color(0.901, 0.298, 0.235))

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

func _build_contract_card(contract: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.063, 0.078, 1.0)
	
	if is_contraband_mode:
		style.border_color = Color(0.607, 0.349, 0.713, 0.4)
	else:
		style.border_color = Color(0.18, 0.803, 0.443, 0.3)
	style.border_width_left = 3
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 5)
	panel.add_child(vbox)
	
	# Route header horizontal container for title + badge capsule
	var header_row = HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 10)
	vbox.add_child(header_row)
	
	var header_lbl = Label.new()
	header_lbl.text = "%s → %s" % [contract.get("origin", "?"), contract.get("destination", "?")]
	header_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	header_lbl.add_theme_font_size_override("font_size", 14)
	header_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(header_lbl)
	
	# Append the contract type badge
	var contract_type = contract.get("contractType", "SPOT")
	if contract_type == "SPOT":
		var badge = _create_badge_capsule("SPOT", Color(0.2, 0.22, 0.25, 0.5), Color(0.35, 0.38, 0.42, 0.6))
		header_row.add_child(badge)
	elif contract_type == "PERSISTENT":
		var badge = _create_badge_capsule("PERSISTENT ∞", Color(0.0, 0.4, 0.8, 0.15), Color(0.0, 0.6, 1.0, 0.5))
		header_row.add_child(badge)
	elif contract_type == "LIMITED":
		var badge = _create_badge_capsule("LIMITED", Color(0.9, 0.45, 0.0, 0.15), Color(1.0, 0.6, 0.1, 0.5))
		header_row.add_child(badge)
	
	# Cargo + distance
	var cargo_lbl = Label.new()
	cargo_lbl.text = "Cargo: %s  |  %d km" % [contract.get("cargoType", "?"), int(contract.get("distanceKm", 0))]
	cargo_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.7))
	cargo_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(cargo_lbl)
	
	# Payout
	var pay_lbl = Label.new()
	var payout = contract.get("payoutCash", 0)
	if is_contraband_mode:
		pay_lbl.text = "BLACK MARKET: $%d" % payout
		pay_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	else:
		pay_lbl.text = "LEGAL PAYOUT: $%d" % payout
		pay_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))
	pay_lbl.add_theme_font_size_override("font_size", 12)
	vbox.add_child(pay_lbl)
	
	# Risk (contraband)
	if is_contraband_mode:
		var risk_lbl = Label.new()
		risk_lbl.text = "⚠ Detection Risk: %d%%" % int(contract.get("detectionRisk", 0))
		risk_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		risk_lbl.add_theme_font_size_override("font_size", 11)
		vbox.add_child(risk_lbl)
		
	# Quota and timer for LIMITED
	if contract_type == "LIMITED":
		var quota_val = contract.get("remainingQuota", null)
		if quota_val != null:
			var quota_lbl = Label.new()
			quota_lbl.text = "📦 QUOTA REMAINING: %s kg" % String.num(float(quota_val), 0)
			quota_lbl.add_theme_color_override("font_color", Color(1.0, 0.6, 0.1))
			quota_lbl.add_theme_font_size_override("font_size", 10)
			vbox.add_child(quota_lbl)
			
		var expires_at = contract.get("expiresAt", null)
		if expires_at != null and typeof(expires_at) == TYPE_STRING and expires_at != "":
			var expires_unix = Time.get_unix_time_from_datetime_string(expires_at)
			var current_unix = Time.get_unix_time_from_system()
			var remaining_sec = expires_unix - current_unix
			if remaining_sec > 0:
				var h = int(remaining_sec / 3600)
				var m = int((int(remaining_sec) % 3600) / 60)
				var timer_lbl = Label.new()
				timer_lbl.text = "⏰ TIME REMAINING: %dh %dm" % [h, m]
				timer_lbl.add_theme_color_override("font_color", Color(1.0, 0.45, 0.0))
				timer_lbl.add_theme_font_size_override("font_size", 10)
				vbox.add_child(timer_lbl)
	
	var btn = Button.new()
	btn.text = "▶ SELECT CONTRACT"
	btn.add_theme_font_size_override("font_size", 11)
	var btn_color = Color(0.607, 0.349, 0.713) if is_contraband_mode else Color(0.18, 0.803, 0.443)
	btn.add_theme_color_override("font_color", btn_color)
	var style_btn = StyleBoxFlat.new()
	style_btn.bg_color = Color(btn_color.r, btn_color.g, btn_color.b, 0.08)
	style_btn.border_color = Color(btn_color.r, btn_color.g, btn_color.b, 0.35)
	style_btn.border_width_bottom = 1
	style_btn.set_corner_radius_all(4)
	btn.add_theme_stylebox_override("normal", style_btn)
	btn.pressed.connect(_select_contract.bind(contract))
	vbox.add_child(btn)
	
	return panel

func _build_route_card(route: Dictionary) -> PanelContainer:
	var truck_id = route.get("truckId", "?")
	var is_smuggle = route.get("isSmuggling", false)
	var pct = int(float(route.get("progressPct", 0)))
	var driver_name = route.get("driverName", "Unknown Driver")
	var fatigue = int(route.get("driverFatigue", 0))
	var tacho = float(route.get("driverTachoHours", 0.0))
	var stimulated = bool(route.get("driverIsStimulated", false))
	var engine_hp = int(route.get("engineHealth", 100))
	var tire_hp = int(route.get("tireWear", 100))
	var current_city = route.get("currentCity", "En Route")
	var origin = route.get("originCity", route.get("currentCity", "?"))
	var dest = route.get("destinationCity", "?")
	
	# Cosmetic health parsing
	var cosmetic_hp = 100
	if route.has("cosmeticHealth"):
		cosmetic_hp = int(route.get("cosmeticHealth", 100))
	elif route.has("truck") and route.get("truck") is Dictionary:
		cosmetic_hp = int(route.get("truck", {}).get("cosmeticHealth", 100))
		
	var weather = route.get("currentWeather", "CLEAR")

	var panel = PanelContainer.new()
	panel.name = "route_" + truck_id
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.063, 0.090, 1.0)
	style.border_color = Color(0.607, 0.349, 0.713, 0.6) if is_smuggle else Color(0.925, 0.607, 0.141, 0.4)
	style.border_width_left = 4
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 5)
	panel.add_child(vbox)

	# Header row
	var header_row = HBoxContainer.new()
	header_row.add_theme_constant_override("separation", 8)
	var route_icon = Label.new()
	route_icon.text = "⚠ SMUGGLE" if is_smuggle else "🚛 LEGAL"
	route_icon.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713) if is_smuggle else Color(0.18, 0.803, 0.443))
	route_icon.add_theme_font_size_override("font_size", 12)
	header_row.add_child(route_icon)
	var route_lbl = Label.new()
	route_lbl.text = "%s → %s" % [origin, dest]
	route_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	route_lbl.add_theme_font_size_override("font_size", 13)
	route_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_row.add_child(route_lbl)
	var city_lbl = Label.new()
	city_lbl.text = "📍 " + current_city
	city_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.6))
	city_lbl.add_theme_font_size_override("font_size", 10)
	header_row.add_child(city_lbl)
	vbox.add_child(header_row)

	# Route progress bar
	_add_stat_bar(vbox, "ROUTE", pct, 100, Color(0.925, 0.607, 0.141))

	# Weather banner (if applicable)
	if weather != "CLEAR":
		var weather_banner = PanelContainer.new()
		var w_style = StyleBoxFlat.new()
		if weather == "THICK_FOG":
			w_style.bg_color = Color(0.2, 0.22, 0.25, 0.4)
			w_style.border_color = Color(0.5, 0.55, 0.6, 0.6)
		elif weather == "ICE_STORM":
			w_style.bg_color = Color(0.0, 0.3, 0.5, 0.3)
			w_style.border_color = Color(0.0, 0.7, 1.0, 0.6)
		w_style.set_border_width_all(1)
		w_style.set_corner_radius_all(4)
		w_style.content_margin_left = 10
		w_style.content_margin_right = 10
		w_style.content_margin_top = 4
		w_style.content_margin_bottom = 4
		weather_banner.add_theme_stylebox_override("panel", w_style)
		
		var w_lbl = Label.new()
		if weather == "THICK_FOG":
			w_lbl.text = "🌫️ WEATHER HAZARD: THICK FOG (-50% Speed)"
			w_lbl.add_theme_color_override("font_color", Color(0.85, 0.85, 0.9))
		elif weather == "ICE_STORM":
			w_lbl.text = "❄️ WEATHER HAZARD: ICE STORM (Cosmetic Damage)"
			w_lbl.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0))
		w_lbl.add_theme_font_size_override("font_size", 10)
		weather_banner.add_child(w_lbl)
		vbox.add_child(weather_banner)

	# Driver row
	var driver_row = HBoxContainer.new()
	driver_row.add_theme_constant_override("separation", 8)
	var driver_icon = Label.new()
	driver_icon.text = "💊" if stimulated else "👤"
	driver_icon.add_theme_font_size_override("font_size", 12)
	driver_row.add_child(driver_icon)
	var d_name_lbl = Label.new()
	d_name_lbl.text = driver_name
	d_name_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713) if stimulated else Color(0.709, 0.768, 0.843))
	d_name_lbl.add_theme_font_size_override("font_size", 11)
	d_name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	driver_row.add_child(d_name_lbl)
	var tacho_lbl = Label.new()
	tacho_lbl.text = "TACHO: %.1fh" % tacho
	var tacho_color = Color(0.901, 0.298, 0.235) if tacho > 10.0 else (Color(0.925, 0.607, 0.141) if tacho > 7.0 else Color(0.18, 0.803, 0.443))
	tacho_lbl.add_theme_color_override("font_color", tacho_color)
	tacho_lbl.add_theme_font_size_override("font_size", 11)
	driver_row.add_child(tacho_lbl)
	vbox.add_child(driver_row)

	# Fatigue bar
	var fatigue_color = Color(0.901, 0.298, 0.235) if fatigue > 80 else (Color(0.925, 0.607, 0.141) if fatigue > 50 else Color(0.18, 0.803, 0.443))
	_add_stat_bar(vbox, "FATIGUE", fatigue, 100, fatigue_color)

	# Truck health row
	var health_row = HBoxContainer.new()
	health_row.add_theme_constant_override("separation", 8)
	
	var engine_lbl = Label.new()
	engine_lbl.text = "ENG"
	engine_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	engine_lbl.add_theme_font_size_override("font_size", 9)
	health_row.add_child(engine_lbl)
	var e_bar_bg = _make_bar_bg(Color(0.901, 0.298, 0.235) if engine_hp < 30 else Color(0.18, 0.803, 0.443), engine_hp, 100)
	e_bar_bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	health_row.add_child(e_bar_bg)
	
	var tire_lbl = Label.new()
	tire_lbl.text = "TIR"
	tire_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	tire_lbl.add_theme_font_size_override("font_size", 9)
	health_row.add_child(tire_lbl)
	var t_bar_bg = _make_bar_bg(Color(0.901, 0.298, 0.235) if tire_hp < 30 else Color(0.925, 0.607, 0.141), tire_hp, 100)
	t_bar_bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	health_row.add_child(t_bar_bg)

	var cosmetic_lbl = Label.new()
	cosmetic_lbl.text = "COS"
	cosmetic_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	cosmetic_lbl.add_theme_font_size_override("font_size", 9)
	health_row.add_child(cosmetic_lbl)
	var c_bar_bg = _make_bar_bg(Color(0.901, 0.298, 0.235) if cosmetic_hp < 30 else Color(0.7, 0.8, 0.9), cosmetic_hp, 100)
	c_bar_bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	health_row.add_child(c_bar_bg)
	
	vbox.add_child(health_row)

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
	row.add_child(bar)
	var val_lbl = Label.new()
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
	selected_contract = contract
	dispatch_panel.show()
	selected_contract_lbl.text = "%s → %s\n%s\n$%d payout" % [
		contract.get("origin", "?"),
		contract.get("destination", "?"),
		contract.get("cargoType", "?"),
		int(contract.get("payoutCash", 0))
	]
	_log("Contract selected. Choose truck and launch.", Color(0.925, 0.607, 0.141))

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
			var idx = card.get_index()
			card.queue_free()
			# Merge cached API data with live telemetry payload
			var merged_route = {}
			for route in active_routes:
				if route.get("truckId", "") == truck_id:
					merged_route = route.duplicate()
					break
			merged_route.merge(payload, true)
			var new_card = _build_route_card(merged_route)
			active_routes_list.add_child(new_card)
			active_routes_list.move_child(new_card, idx)
			return
	
	# Card not found — full re-render on first progress tick for a new route
	_fetch_active_routes()

func _on_route_completed(payload: Dictionary) -> void:
	live_progress = 0.0
	var truck_id = payload.get("truckId", "")
	GameState.active_routes.erase(truck_id)
	_log("✓ DELIVERY CONFIRMED: %s payout credited." % ["$" + str(int(payload.get("payout", 0)))], Color(0.18, 0.803, 0.443))
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

func _apply_theme() -> void:
	pass

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
	
	var btn_bribe = Button.new()
	btn_bribe.text = "BRIBE OFFICER\n($5000 Clean Cash)"
	btn_bribe.custom_minimum_size = Vector2(160, 60)
	btn_bribe.pressed.connect(func(): NetworkManager.trigger_border_action(truck_id, "BRIBE", 5000.0))
	hbox.add_child(btn_bribe)
	
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

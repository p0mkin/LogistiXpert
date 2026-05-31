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

var api_base: String = "http://127.0.0.1:3000/api"
var available_trucks: Array = []
var legal_contracts: Array = []
var contraband_jobs: Array = []
var active_routes: Array = []
var selected_contract: Dictionary = {}
var is_contraband_mode: bool = false

# Tacho dial telemetry for selected active route
var tacho_anim_time: float = 0.0
var live_progress: float = 0.0  # 0.0 - 1.0

func _ready() -> void:
	_apply_theme()
	player_lbl.text = GameState.username.to_upper()
	_refresh_header()
	
	GameState.balance_updated.connect(_on_balances_updated)
	GameState.reputation_updated.connect(_on_reputation_updated)
	NetworkManager.ws_message_received.connect(_on_ws_message)
	
	back_btn.pressed.connect(_on_back)
	launch_btn.pressed.connect(_on_launch_dispatch)
	tab_legal_btn.pressed.connect(_show_legal_tab)
	tab_contra_btn.pressed.connect(_show_contra_tab)
	
	_fetch_contracts()
	_fetch_active_routes()
	_fetch_trucks()
	
	set_process(true)

func _process(delta: float) -> void:
	tacho_anim_time += delta
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
	var body: Dictionary = {"truckId": truck_id}
	
	if is_contraband_mode:
		body["contrabandJobId"] = selected_contract.get("id", "")
	else:
		body["legalContractId"] = selected_contract.get("id", "")
	
	_log("Dispatching truck %s..." % truck_id, Color(0.925, 0.607, 0.141))
	
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
					"border": false
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
					"detectionRisk": float(item.get("riskMultiplier", 1.0)) * 15.0
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
						if not truck.get("isImpounded", false) and not truck.has("activeRoute"):
							available_trucks.append(truck)
		
		truck_select_box.clear()
		for i in range(available_trucks.size()):
			var t = available_trucks[i]
			truck_select_box.add_item("%s (E:%d%%)" % [t.get("model","?"), int(t.get("engineHealth",0))], i)
		
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
	
	# Route header
	var header_lbl = Label.new()
	header_lbl.text = "%s → %s" % [contract.get("origin", "?"), contract.get("destination", "?")]
	header_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	header_lbl.add_theme_font_size_override("font_size", 14)
	vbox.add_child(header_lbl)
	
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
	var panel = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.063, 0.090, 1.0)
	style.border_color = Color(0.925, 0.607, 0.141, 0.4)
	style.border_width_left = 3
	style.border_width_right = 0
	style.set_corner_radius_all(6)
	style.content_margin_left = 14
	style.content_margin_right = 14
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 4)
	panel.add_child(vbox)
	
	var truck_id = route.get("truckId", "?")
	var origin = route.get("originCity", "?")
	var dest = route.get("destinationCity", "?")
	var pct = int(float(route.get("progressPct", 0)))
	var is_smuggle = route.get("isSmuggling", false)
	
	var route_lbl = Label.new()
	route_lbl.text = ("⚠ SMUGGLE" if is_smuggle else "🚛 LEGAL") + "  %s → %s" % [origin, dest]
	route_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141) if is_smuggle else Color(1, 1, 1))
	route_lbl.add_theme_font_size_override("font_size", 13)
	vbox.add_child(route_lbl)
	
	var truck_lbl = Label.new()
	truck_lbl.text = "Truck ID: ...%s" % truck_id.right(8)
	truck_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.6))
	truck_lbl.add_theme_font_size_override("font_size", 10)
	vbox.add_child(truck_lbl)
	
	# Progress bar
	var prog_row = HBoxContainer.new()
	prog_row.add_theme_constant_override("separation", 8)
	
	var prog_bg = PanelContainer.new()
	prog_bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	prog_bg.custom_minimum_size.y = 6
	var style_bg = StyleBoxFlat.new()
	style_bg.bg_color = Color(0.1, 0.1, 0.1)
	style_bg.set_corner_radius_all(3)
	prog_bg.add_theme_stylebox_override("panel", style_bg)
	
	var prog_fill = PanelContainer.new()
	prog_fill.anchor_right = float(pct) / 100.0
	var style_fill = StyleBoxFlat.new()
	style_fill.bg_color = Color(0.925, 0.607, 0.141)
	style_fill.set_corner_radius_all(3)
	prog_fill.add_theme_stylebox_override("panel", style_fill)
	prog_bg.add_child(prog_fill)
	
	prog_row.add_child(prog_bg)
	
	var pct_lbl = Label.new()
	pct_lbl.text = "%d%%" % pct
	pct_lbl.add_theme_font_size_override("font_size", 10)
	pct_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	prog_row.add_child(pct_lbl)
	vbox.add_child(prog_row)
	
	return panel

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
func _on_ws_message(packet: Dictionary) -> void:
	match packet.get("type", ""):
		"DISPATCH_TICK":
			var payload = packet.get("payload", {})
			live_progress = float(payload.get("progressPct", 0)) / 100.0
			_fetch_active_routes()
		"BORDER_CHECK":
			var payload = packet.get("payload", {})
			_log("⚠ CUSTOMS INSPECTION: " + payload.get("outcome", ""), Color(0.925, 0.607, 0.141))
		"ROUTE_COMPLETE":
			_log("✓ Route completed! Payout credited.", Color(0.18, 0.803, 0.443))
			live_progress = 0.0
			_fetch_active_routes()
			_fetch_trucks()
		"MICROSLEEP_CRASH":
			_log("💥 FATIGUE CRASH! Driver microsleep incident.", Color(0.901, 0.298, 0.235))
		"SEIZURE":
			_log("⛔ CARGO SEIZED at border!", Color(0.901, 0.298, 0.235))

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
	get_tree().change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _apply_theme() -> void:
	pass

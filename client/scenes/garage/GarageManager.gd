extends Control

# ==========================================
# GARAGE MANAGER SCENE
# Central fleet operations hub:
# - Fleet list (trucks with live health bars)
# - Driver roster with trait badges
# - Quick dispatch initiation
# - Parts shop & repairs
# ==========================================

@onready var back_btn: Button = %BackBtn
@onready var fleet_list: VBoxContainer = %FleetList
@onready var driver_list: VBoxContainer = %DriverList
@onready var detail_panel: PanelContainer = %DetailPanel
@onready var detail_title: Label = %DetailTitle
@onready var detail_status: Label = %DetailStatus
@onready var detail_body: VBoxContainer = %DetailBody
@onready var action_btn_1: Button = %ActionBtn1
@onready var action_btn_2: Button = %ActionBtn2
var action_btn_3: Button = null
@onready var console_lbl: Label = %ConsoleLabel
@onready var hire_btn: Button = %HireBtn
@onready var balance_lbl: Label = %BalanceLabel
@onready var dirty_lbl: Label = %DirtyLabel
@onready var player_lbl: Label = %PlayerLabel

var api_base: String = "http://127.0.0.1:3000/api"
var trucks_data: Array = []
var drivers_data: Array = []
var selected_truck: Dictionary = {}
var selected_driver: Dictionary = {}
var mode: String = "fleet" # "fleet" or "drivers"

# Commodity Trading Panel Variables
var commodity_panel: PanelContainer = null
var commodity_vbox: VBoxContainer = null
var market_prices: Dictionary = {
	"DIESEL": { "price": 1.50, "prev_price": 1.50 },
	"ELECTRICITY": { "price": 0.22, "prev_price": 0.22 },
	"ADBLUE": { "price": 0.85, "prev_price": 0.85 },
	"CO2_ALLOWANCE": { "price": 85.0, "prev_price": 85.0 }
}


func _ready() -> void:
	_apply_theme()
	player_lbl.text = GameState.username.to_upper()
	_refresh_balances()
	
	GameState.balance_updated.connect(_on_balances_updated)
	
	back_btn.pressed.connect(_on_back_pressed)
	hire_btn.pressed.connect(_on_hire_driver)
	action_btn_1.pressed.connect(_on_action_1)
	action_btn_2.pressed.connect(_on_action_2)
	
	# Dynamically inject the third action button into detail panel if not present
	var detail_inner = detail_panel.get_node("DetailInner")
	if not detail_inner.has_node("ActionBtn3"):
		action_btn_3 = Button.new()
		action_btn_3.name = "ActionBtn3"
		action_btn_3.theme_type_variation = "Button"
		action_btn_3.add_theme_font_size_override("font_size", 12)
		action_btn_3.pressed.connect(_on_action_3)
		detail_inner.add_child(action_btn_3)
	else:
		action_btn_3 = detail_inner.get_node("ActionBtn3")
	action_btn_3.hide()
	
	# Dynamic Commodity Panel Setup
	_setup_commodity_panel()
	_fetch_initial_commodity_prices()
	
	NetworkManager.market_prices_updated.connect(_on_market_prices_updated)
	NetworkManager.garage_stock_updated.connect(_on_garage_stock_updated)
	
	_fetch_fleet()
	_fetch_drivers()

# ==========================================
# API REQUESTS
# ==========================================
func _fetch_fleet() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_fleet_response.bind(http))
	http.request(
		api_base + "/garage",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _fetch_drivers() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_drivers_response.bind(http))
	http.request(
		api_base + "/driver",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _repair_truck(truck_id: String, part_id: String) -> void:
	_log("Sending repair order...", Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_repair_response.bind(http))
	var body = JSON.stringify({"truckId": truck_id, "partId": part_id})
	http.request(
		api_base + "/shop/buy",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

func _roadside_repair(truck_id: String) -> void:
	_log("Calling emergency roadside repair (+50% surcharge)...", Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_roadside_response.bind(http))
	var body = JSON.stringify({"truckId": truck_id, "repairEngine": true, "repairTires": true})
	http.request(
		api_base + "/breakdown/roadside-repair",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

func _release_impound(truck_id: String) -> void:
	_log("Processing early impound release...", Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_impound_response.bind(http))
	http.request(
		api_base + "/breakdown/release-impound/" + truck_id,
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		"{}"
	)

func _administer_stimulant(driver_id: String) -> void:
	_log("Ordering chemical override...", Color(0.607, 0.349, 0.713))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_stimulant_response.bind(http))
	http.request(
		api_base + "/driver/" + driver_id + "/stimulate",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_POST
	)

func _rest_driver(driver_id: String, location: String) -> void:
	_log("Ordering driver rest rotation...", Color(0.180, 0.803, 0.443))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_rest_response.bind(http))
	var body = JSON.stringify({"restLocation": location})
	http.request(
		api_base + "/driver/" + driver_id + "/rest",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

func _hire_driver_api() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_hire_response.bind(http))
	http.request(
		api_base + "/driver/hire",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		"{}"
	)

func _assign_driver(driver_id: String, truck_id: String) -> void:
	_log("Assigning driver to truck...", Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_assign_response.bind(http))
	http.request(
		api_base + "/driver/" + driver_id + "/assign",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		JSON.stringify({"truckId": truck_id})
	)

func _unassign_driver(driver_id: String) -> void:
	_log("Releasing driver from truck...", Color(0.709, 0.768, 0.843))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_assign_response.bind(http))
	http.request(
		api_base + "/driver/" + driver_id + "/unassign",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		"{}"
	)

func _spoof_tacho(driver_id: String) -> void:
	_log("Installing ECU Tacho Spoof ($3500 BM)...", Color(0.607, 0.349, 0.713))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_spoof_response.bind(http))
	http.request(
		api_base + "/driver/" + driver_id + "/spoof-tacho",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		"{}"
	)

# ==========================================
# RESPONSE HANDLERS
# ==========================================
func _on_fleet_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if response_code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data:
			# Sync full garages telemetry in GameState
			if data is Array:
				GameState.garages = data
				
			# Garages contain trucks; flatten into truck list
			trucks_data = []
			if data is Array:
				for garage in data:
					if garage.has("trucks"):
						for truck in garage.trucks:
							trucks_data.append(truck)
			_render_fleet_list()
			_render_commodity_panel()
			_log("Fleet data loaded: %d trucks operational." % trucks_data.size(), Color(0.180, 0.803, 0.443))
	else:
		_log("Fleet sync failed (HTTP %d)." % response_code, Color(0.901, 0.298, 0.235))

func _on_drivers_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if response_code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Array:
			drivers_data = data
			_render_driver_list()
			_log("Driver roster loaded: %d contractors on payroll." % drivers_data.size(), Color(0.180, 0.803, 0.443))

func _on_repair_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log("Repair complete: " + data.get("message", "OK"), Color(0.180, 0.803, 0.443))
		_fetch_fleet()
	else:
		_log("Repair failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

func _on_roadside_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		var charge = float(data.get("totalCharge", 0))
		GameState.update_balances(-charge, 0.0)
		_log("✓ Roadside repair complete! Cost: $%.0f (emergency surcharge applied)." % charge, Color(0.180, 0.803, 0.443))
		_fetch_fleet()
	else:
		_log("Roadside repair failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

func _on_impound_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		var fee = float(data.get("fee", 0))
		if fee > 0:
			GameState.update_balances(-fee, 0.0)
			_log("✓ Truck released from impound. Fee paid: $%.0f" % fee, Color(0.180, 0.803, 0.443))
		else:
			_log("✓ Truck released from impound (lockdown expired).", Color(0.180, 0.803, 0.443))
		_fetch_fleet()
	else:
		var required = float(data.get("required", 0))
		if required > 0:
			_log("⛔ Insufficient funds for impound release. Need: $%.0f" % required, Color(0.901, 0.298, 0.235))
		else:
			_log("Release failed: " + data.get("error", "Error"), Color(0.901, 0.298, 0.235))

func _on_stimulant_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log(data.get("message", "Stimulant administered."), Color(0.607, 0.349, 0.713))
		_fetch_drivers()
	else:
		_log("Refused: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

func _on_rest_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log("Rest rotation complete. Fatigue cleared.", Color(0.180, 0.803, 0.443))
		_fetch_drivers()
	else:
		_log("Rest failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

func _on_hire_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 201:
		var d = data.get("driver", {})
		_log("Recruited: %s (%s) — Loyalty: %d" % [d.get("name","?"), d.get("trait","?"), d.get("loyalty", 0)], Color(0.180, 0.803, 0.443))
		GameState.update_balances(-2500.0, 0.0)
		_fetch_drivers()
	else:
		_log("Hire failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

func _on_assign_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log(data.get("message", "Driver assignment updated."), Color(0.180, 0.803, 0.443))
		_fetch_drivers()
		_fetch_fleet()
	else:
		_log("Assignment failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

func _on_spoof_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		GameState.update_balances(0.0, -3500.0)
		_log("Tacho Spoof installed. Tachograph reads 0.0h — forged compliance active.", Color(0.607, 0.349, 0.713))
		_fetch_drivers()
	else:
		_log("Spoof failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

# ==========================================
# RENDERING FLEET AND DRIVER LISTS
# ==========================================
func _render_fleet_list() -> void:
	for child in fleet_list.get_children():
		child.queue_free()
	
	for truck in trucks_data:
		var card = _build_truck_card(truck)
		fleet_list.add_child(card)

func _render_driver_list() -> void:
	for child in driver_list.get_children():
		child.queue_free()
	
	for driver in drivers_data:
		var card = _build_driver_card(driver)
		driver_list.add_child(card)

func _build_truck_card(truck: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.063, 0.078, 1.0)
	style.border_color = Color(0.180, 0.803, 0.443, 0.25)
	style.border_width_left = 3
	style.set_corner_radius_all(6)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", style)
	panel.custom_minimum_size.x = 400
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	panel.add_child(vbox)
	
	# Truck header
	var header = HBoxContainer.new()
	var model_lbl = Label.new()
	model_lbl.text = truck.get("model", "Unknown Truck")
	model_lbl.add_theme_color_override("font_color", Color(1, 1, 1, 1))
	model_lbl.add_theme_font_size_override("font_size", 15)
	header.add_child(model_lbl)
	
	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)
	
	# Status indicator
	var status_lbl = Label.new()
	if truck.get("isImpounded", false):
		status_lbl.text = "⛔ SEIZED"
		status_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	elif truck.has("activeRoute"):
		status_lbl.text = "🚛 ON ROAD"
		status_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	else:
		status_lbl.text = "✓ STANDBY"
		status_lbl.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443))
	status_lbl.add_theme_font_size_override("font_size", 12)
	header.add_child(status_lbl)
	vbox.add_child(header)
	
	# VIN
	var vin_lbl = Label.new()
	vin_lbl.text = "VIN: " + truck.get("vin", "???")
	vin_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.6))
	vin_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(vin_lbl)
	
	# Health bars
	var engine_pct = int(truck.get("engineHealth", 100))
	var tire_pct = int(truck.get("tireWear", 100))
	var mileage = truck.get("mileage", 0)
	
	vbox.add_child(_build_health_bar("ENGINE", engine_pct))
	vbox.add_child(_build_health_bar("TIRES", tire_pct))
	
	# Mileage / Rigging info row
	var info_row = HBoxContainer.new()
	info_row.add_theme_constant_override("separation", 16)
	
	var miles_lbl = Label.new()
	miles_lbl.text = "%.0f km" % mileage
	miles_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.7))
	miles_lbl.add_theme_font_size_override("font_size", 11)
	info_row.add_child(miles_lbl)
	
	var mod_lbl = Label.new()
	var mod = truck.get("fuelTankMod", "STOCK")
	if mod == "FALSE_BOTTOM":
		mod_lbl.text = "⚠ FALSE BOTTOM"
		mod_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	elif mod == "CHASSIS_CAVITY":
		mod_lbl.text = "⚠ CHASSIS STASH"
		mod_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	else:
		mod_lbl.text = "STOCK"
		mod_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
	mod_lbl.add_theme_font_size_override("font_size", 11)
	info_row.add_child(mod_lbl)
	vbox.add_child(info_row)
	
	# Click to select
	var btn = Button.new()
	btn.text = "▶ SELECT"
	btn.add_theme_font_size_override("font_size", 11)
	btn.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443))
	var style_btn = StyleBoxFlat.new()
	style_btn.bg_color = Color(0.180, 0.803, 0.443, 0.08)
	style_btn.border_color = Color(0.180, 0.803, 0.443, 0.3)
	style_btn.border_width_bottom = 1
	style_btn.set_corner_radius_all(4)
	btn.add_theme_stylebox_override("normal", style_btn)
	btn.pressed.connect(_select_truck.bind(truck))
	vbox.add_child(btn)
	
	return panel

func _build_driver_card(driver: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.063, 0.078, 1.0)
	
	# Color border by loyalty tier
	var loyalty = int(driver.get("loyalty", 0))
	if loyalty >= 80:
		style.border_color = Color(0.607, 0.349, 0.713, 0.5)  # purple = high loyalty
	elif loyalty >= 60:
		style.border_color = Color(0.180, 0.803, 0.443, 0.35) # green = mid loyalty
	else:
		style.border_color = Color(0.901, 0.298, 0.235, 0.3)  # red = low loyalty / unreliable
	
	style.border_width_left = 3
	style.set_corner_radius_all(6)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", style)
	panel.custom_minimum_size.x = 400
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 5)
	panel.add_child(vbox)
	
	# Driver name + trait badge
	var header = HBoxContainer.new()
	var name_lbl = Label.new()
	name_lbl.text = driver.get("name", "Unknown Driver")
	name_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	name_lbl.add_theme_font_size_override("font_size", 14)
	header.add_child(name_lbl)
	
	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)
	
	var trait_lbl = Label.new()
	var trait = driver.get("trait", "BALANCED")
	trait_lbl.text = "[%s]" % trait
	trait_lbl.add_theme_font_size_override("font_size", 11)
	match trait:
		"LOYAL":
			trait_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
		"LEAD_FOOT":
			trait_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		"SLEEP_DEPRIVED":
			trait_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
		_:
			trait_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.7))
	header.add_child(trait_lbl)
	vbox.add_child(header)
	
	# Fatigue + Stimulant state
	var stim_lbl = Label.new()
	var stimulated = driver.get("isStimulated", false)
	var fatigue = int(driver.get("fatigue", 0))
	var tacho = driver.get("tachoHours", 0.0)
	
	if stimulated:
		stim_lbl.text = "⚗ STIMULANT ACTIVE"
		stim_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	else:
		stim_lbl.text = "Tacho: %.1fh" % tacho
		stim_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.6))
	stim_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(stim_lbl)
	
	# Fatigue bar
	vbox.add_child(_build_health_bar("FATIGUE", fatigue, true))
	
	# Loyalty bar
	vbox.add_child(_build_health_bar("LOYALTY", loyalty))
	
	# Action button
	var btn = Button.new()
	btn.text = "▶ MANAGE"
	btn.add_theme_font_size_override("font_size", 11)
	btn.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	var style_btn = StyleBoxFlat.new()
	style_btn.bg_color = Color(0.607, 0.349, 0.713, 0.08)
	style_btn.border_color = Color(0.607, 0.349, 0.713, 0.3)
	style_btn.border_width_bottom = 1
	style_btn.set_corner_radius_all(4)
	btn.add_theme_stylebox_override("normal", style_btn)
	btn.pressed.connect(_select_driver.bind(driver))
	vbox.add_child(btn)
	
	return panel

func _build_health_bar(label: String, pct: int, is_bad_high: bool = false) -> HBoxContainer:
	var row = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	
	var lbl = Label.new()
	lbl.text = label
	lbl.custom_minimum_size.x = 70
	lbl.add_theme_font_size_override("font_size", 10)
	lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	row.add_child(lbl)
	
	var bg = PanelContainer.new()
	bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bg.custom_minimum_size.y = 8
	var style_bg = StyleBoxFlat.new()
	style_bg.bg_color = Color(0.1, 0.1, 0.1)
	style_bg.set_corner_radius_all(4)
	bg.add_theme_stylebox_override("panel", style_bg)
	
	var fill = PanelContainer.new()
	fill.size_flags_horizontal = Control.SIZE_FILL
	
	# Determine fill color based on percentage and type
	var fill_color: Color
	if is_bad_high: # fatigue: high = red
		if pct > 75: fill_color = Color(0.901, 0.298, 0.235)
		elif pct > 40: fill_color = Color(0.925, 0.607, 0.141)
		else: fill_color = Color(0.180, 0.803, 0.443)
	else: # health: low = red
		if pct < 25: fill_color = Color(0.901, 0.298, 0.235)
		elif pct < 60: fill_color = Color(0.925, 0.607, 0.141)
		else: fill_color = Color(0.180, 0.803, 0.443)
	
	var style_fill = StyleBoxFlat.new()
	style_fill.bg_color = fill_color
	style_fill.set_corner_radius_all(4)
	fill.add_theme_stylebox_override("panel", style_fill)
	
	# Simulate width via stretch ratio (Godot % trick with anchors)
	fill.anchor_right = float(pct) / 100.0
	fill.offset_right = 0
	
	bg.add_child(fill)
	row.add_child(bg)
	
	var pct_lbl = Label.new()
	pct_lbl.text = "%d%%" % pct
	pct_lbl.custom_minimum_size.x = 36
	pct_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	pct_lbl.add_theme_font_size_override("font_size", 10)
	pct_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.6))
	row.add_child(pct_lbl)
	
	return row

# ==========================================
# SELECTION & DETAIL PANEL
# ==========================================
func _select_truck(truck: Dictionary) -> void:
	selected_truck = truck
	selected_driver = {}
	mode = "fleet"
	detail_panel.show()
	detail_title.text = truck.get("model", "Truck")
	var engine = int(truck.get("engineHealth", 0))
	var tires = int(truck.get("tireWear", 0))
	var impound = truck.get("isImpounded", false)
	var on_road = truck.has("activeRoute") and truck.activeRoute != null

	if impound:
		detail_status.text = "STATUS: ⛔ IMPOUNDED"
		detail_status.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	else:
		detail_status.text = "STATUS: OPERATIONAL"
		detail_status.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443))

	for child in detail_body.get_children():
		child.queue_free()

	var info_lines = [
		"VIN: " + truck.get("vin", "???"),
		"Engine Health: %d%%" % engine,
		"Tire Wear: %d%%" % tires,
		"Mileage: %.0f km" % truck.get("mileage", 0),
		"Fuel Capacity: %.0f L" % truck.get("fuelCapacity", 0),
		"Shield Level: %d/5" % int(truck.get("scannerShielding", 0)),
		"Rigging: " + truck.get("fuelTankMod", "STOCK"),
	]

	for line in info_lines:
		var lbl = Label.new()
		lbl.text = line
		lbl.add_theme_font_size_override("font_size", 12)
		lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.85))
		detail_body.add_child(lbl)

	# Impounded truck — show impound release button
	if impound:
		var release_cd = truck.get("impoundReleaseAt", "")
		var cd_lbl = Label.new()
		cd_lbl.text = "⏱ Release date: " + str(release_cd).left(10) if release_cd != "" else "⏱ Release date: unknown"
		cd_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235, 0.8))
		cd_lbl.add_theme_font_size_override("font_size", 11)
		detail_body.add_child(cd_lbl)

		var release_btn = Button.new()
		release_btn.text = "💰 EARLY IMPOUND RELEASE ($3,500/day x2)"
		release_btn.add_theme_font_size_override("font_size", 11)
		release_btn.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		var rs = StyleBoxFlat.new()
		rs.bg_color = Color(0.925, 0.607, 0.141, 0.07)
		rs.border_color = Color(0.925, 0.607, 0.141, 0.35)
		rs.border_width_bottom = 1
		rs.set_corner_radius_all(4)
		release_btn.add_theme_stylebox_override("normal", rs)
		release_btn.pressed.connect(_release_impound.bind(truck.get("id", "")))
		detail_body.add_child(release_btn)

		action_btn_1.hide()
		action_btn_2.hide()
		if action_btn_3: action_btn_3.hide()
		return

	# Truck is on road — show roadside repair for broken down trucks
	if on_road and (engine < 30 or tires < 20):
		var warn_lbl = Label.new()
		warn_lbl.text = "⚠ BREAKDOWN RISK: Engine %d%% / Tires %d%%" % [engine, tires]
		warn_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
		warn_lbl.add_theme_font_size_override("font_size", 11)
		detail_body.add_child(warn_lbl)

		var roadside_btn = Button.new()
		roadside_btn.text = "🔧 EMERGENCY ROADSIDE REPAIR (+50% surcharge)"
		roadside_btn.add_theme_font_size_override("font_size", 11)
		roadside_btn.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		var rbs = StyleBoxFlat.new()
		rbs.bg_color = Color(0.925, 0.607, 0.141, 0.07)
		rbs.border_color = Color(0.925, 0.607, 0.141, 0.35)
		rbs.border_width_bottom = 1
		rbs.set_corner_radius_all(4)
		roadside_btn.add_theme_stylebox_override("normal", rbs)
		roadside_btn.pressed.connect(_roadside_repair.bind(truck.get("id", "")))
		detail_body.add_child(roadside_btn)

		action_btn_1.hide()
		action_btn_2.hide()
		if action_btn_3: action_btn_3.hide()
		return

	action_btn_1.text = "🔧 REPAIR ENGINE ($1800)"
	action_btn_1.show()
	action_btn_2.text = "🛥 REPLACE TIRES ($900)"
	action_btn_2.show()
	if action_btn_3: action_btn_3.hide()

func _select_driver(driver: Dictionary) -> void:
	selected_driver = driver
	selected_truck = {}
	mode = "drivers"
	detail_panel.show()
	detail_title.text = driver.get("name", "Driver")
	detail_status.text = "TRAIT: " + driver.get("trait", "BALANCED")
	detail_status.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	
	for child in detail_body.get_children():
		child.queue_free()
	
	var loyalty = int(driver.get("loyalty", 0))
	var fatigue = int(driver.get("fatigue", 0))
	var stimulated = driver.get("isStimulated", false)
	
	var info_lines = [
		"Loyalty: %d / 100" % loyalty,
		"Fatigue: %d%%" % fatigue,
		"Tacho Hours: %.1f h" % driver.get("tachoHours", 0.0),
		"Stimulated: %s" % ("YES ⚗" if stimulated else "No"),
		"Charisma: %d" % int(driver.get("charisma", 0)),
	]
	
	for line in info_lines:
		var lbl = Label.new()
		lbl.text = line
		lbl.add_theme_font_size_override("font_size", 12)
		lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.85))
		detail_body.add_child(lbl)
	
	action_btn_1.text = "⚗ ADMINISTER STIMULANT ($500 BM)"
	action_btn_1.show()
	action_btn_2.text = "🛌 SCHENGEN MOTEL REST ($250)"
	action_btn_2.show()
	if action_btn_3:
		action_btn_3.text = "🛌 EASTERN CABIN REST (FREE)"
		action_btn_3.show()

	# Show Tacho Spoof button if tacho > 7h
	var tacho_h = float(driver.get("tachoHours", 0.0))
	if tacho_h > 7.0:
		var spoof_btn = Button.new()
		spoof_btn.text = "💾 INSTALL TACHO SPOOF ($3500 BM) — Tacho: %.1fh" % tacho_h
		spoof_btn.add_theme_font_size_override("font_size", 11)
		spoof_btn.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
		var style_spoof = StyleBoxFlat.new()
		style_spoof.bg_color = Color(0.607, 0.349, 0.713, 0.06)
		style_spoof.border_color = Color(0.607, 0.349, 0.713, 0.4)
		style_spoof.border_width_bottom = 1
		style_spoof.set_corner_radius_all(4)
		spoof_btn.add_theme_stylebox_override("normal", style_spoof)
		spoof_btn.pressed.connect(_spoof_tacho.bind(driver.get("id", "")))
		detail_body.add_child(spoof_btn)

	# Show Assign to truck panel
	var assign_sep = HSeparator.new()
	detail_body.add_child(assign_sep)
	var assign_hdr = Label.new()
	assign_hdr.text = "ASSIGN TO TRUCK"
	assign_hdr.add_theme_font_size_override("font_size", 11)
	assign_hdr.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	detail_body.add_child(assign_hdr)

	var current_truck_id = driver.get("assignedTruckId", null)

	# If already assigned — show unassign button
	if current_truck_id != null:
		var truck_name = "Unknown"
		for t in trucks_data:
			if t.get("id", "") == current_truck_id:
				truck_name = t.get("model", "Unknown")
				break
		var assigned_lbl = Label.new()
		assigned_lbl.text = "Currently assigned to: %s" % truck_name
		assigned_lbl.add_theme_font_size_override("font_size", 11)
		assigned_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443, 0.8))
		detail_body.add_child(assigned_lbl)
		var unassign_btn = Button.new()
		unassign_btn.text = "✕ UNASSIGN FROM TRUCK"
		unassign_btn.add_theme_font_size_override("font_size", 11)
		unassign_btn.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235, 0.8))
		unassign_btn.pressed.connect(_unassign_driver.bind(driver.get("id", "")))
		detail_body.add_child(unassign_btn)
	else:
		# Dropdown to pick available truck
		var avail_trucks = trucks_data.filter(func(t): return not t.get("isImpounded", false) and t.get("driver", null) == null)
		if avail_trucks.is_empty():
			var no_lbl = Label.new()
			no_lbl.text = "No unassigned trucks available."
			no_lbl.add_theme_font_size_override("font_size", 11)
			no_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
			detail_body.add_child(no_lbl)
		else:
			var truck_picker = OptionButton.new()
			for t in avail_trucks:
				truck_picker.add_item("%s (%d%% eng)" % [t.get("model", "?"), int(t.get("engineHealth", 0))])
			detail_body.add_child(truck_picker)
			var do_assign_btn = Button.new()
			do_assign_btn.text = "✓ ASSIGN TO SELECTED TRUCK"
			do_assign_btn.add_theme_font_size_override("font_size", 11)
			do_assign_btn.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))
			do_assign_btn.pressed.connect(func():
				var idx = truck_picker.get_selected_id()
				if idx >= 0 and idx < avail_trucks.size():
					_assign_driver(driver.get("id", ""), avail_trucks[idx].get("id", ""))
			)
			detail_body.add_child(do_assign_btn)

# ==========================================
# BUTTON ACTIONS
# ==========================================
func _on_action_1() -> void:
	if mode == "fleet" and not selected_truck.is_empty():
		_repair_truck(selected_truck.get("id", ""), "engine_kit")
	elif mode == "drivers" and not selected_driver.is_empty():
		_administer_stimulant(selected_driver.get("id", ""))

func _on_action_2() -> void:
	if mode == "fleet" and not selected_truck.is_empty():
		_repair_truck(selected_truck.get("id", ""), "tires_set")
	elif mode == "drivers" and not selected_driver.is_empty():
		_rest_driver(selected_driver.get("id", ""), "SCHENGEN_GARAGE")

func _on_action_3() -> void:
	if mode == "drivers" and not selected_driver.is_empty():
		_rest_driver(selected_driver.get("id", ""), "EAST_CABIN")

func _on_hire_driver() -> void:
	_hire_driver_api()

# ==========================================
# HELPERS
# ==========================================
func _refresh_balances() -> void:
	balance_lbl.text = "$%s CLEAN" % String.num(GameState.legal_balance, 2)
	dirty_lbl.text = "$%s DIRTY" % String.num(GameState.black_market_balance, 2)

func _on_balances_updated(legal: float, dirty: float) -> void:
	balance_lbl.text = "$%s CLEAN" % String.num(legal, 2)
	dirty_lbl.text = "$%s DIRTY" % String.num(dirty, 2)

func _log(text: String, color: Color) -> void:
	console_lbl.text = text
	console_lbl.add_theme_color_override("font_color", color)

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _apply_theme() -> void:
	var style_bg = StyleBoxFlat.new()
	style_bg.bg_color = Color(0.047, 0.051, 0.059, 1.0)
	add_theme_stylebox_override("panel", style_bg)

# ==========================================
# DYNAMIC COMMODITY TRADING OPERATIONS
# ==========================================
func _setup_commodity_panel() -> void:
	var main_layout = get_node("MainLayout")
	if not main_layout: return
	
	commodity_panel = PanelContainer.new()
	commodity_panel.name = "CommodityPanel"
	commodity_panel.custom_minimum_size.x = 340
	
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.063, 0.078, 1.0)
	style.border_color = Color(0.925, 0.607, 0.141, 0.25) # Neon Amber Border
	style.border_width_left = 3
	style.set_corner_radius_all(6)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	commodity_panel.add_theme_stylebox_override("panel", style)
	
	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	commodity_panel.add_child(scroll)
	
	commodity_vbox = VBoxContainer.new()
	commodity_vbox.add_theme_constant_override("separation", 14)
	scroll.add_child(commodity_vbox)
	
	main_layout.add_child(commodity_panel)

func _fetch_initial_commodity_prices() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result, response_code, headers, body):
		if response_code == 200:
			var data = JSON.parse_string(body.get_string_from_utf8())
			if data and data is Array:
				for record in data:
					var type = record.get("commodityType", "")
					var price = float(record.get("currentPrice", 1.0))
					if market_prices.has(type):
						market_prices[type]["price"] = price
						market_prices[type]["prev_price"] = price
				_render_commodity_panel()
		http.queue_free()
	)
	http.request(api_base + "/commodity")

func _on_market_prices_updated(payload: Dictionary) -> void:
	if payload.has("prices"):
		for item in payload.prices:
			var type = item.get("commodityType", "")
			var new_price = float(item.get("currentPrice", 0.0))
			if market_prices.has(type):
				market_prices[type]["prev_price"] = market_prices[type]["price"]
				market_prices[type]["price"] = new_price
		_render_commodity_panel()
		_log("⚡ Market prices fluctuated (co-op trading updated).", Color(0.925, 0.607, 0.141))

func _on_garage_stock_updated(_payload: Dictionary) -> void:
	# Stock changes synced by NetworkManager, force redraw!
	_render_commodity_panel()

func _render_commodity_panel() -> void:
	if not commodity_vbox: return
	
	# Clear previous nodes
	for child in commodity_vbox.get_children():
		child.queue_free()
		
	# 1. Title Header
	var title = Label.new()
	title.text = "◈ COMMODITY TRADING"
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141)) # Amber Neon
	commodity_vbox.add_child(title)
	
	var subtitle = Label.new()
	subtitle.text = "Fluctuating Co-Op Stocks Operations"
	subtitle.add_theme_font_size_override("font_size", 10)
	subtitle.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.45))
	commodity_vbox.add_child(subtitle)
	
	var sep = HSeparator.new()
	sep.modulate = Color(1, 1, 1, 0.4)
	commodity_vbox.add_child(sep)
	
	# Check if we have active garage data loaded
	if GameState.garages.is_empty():
		var info = Label.new()
		info.text = "Waiting for Depot operations sync..."
		info.add_theme_font_size_override("font_size", 12)
		info.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
		commodity_vbox.add_child(info)
		return
		
	# Render the first garage's commodity stockpiles
	var active_garage = GameState.garages[0]
	var garage_id = active_garage.get("id", "")
	var city_name = active_garage.get("city", "HQ")
	
	var location_lbl = Label.new()
	location_lbl.text = "HQ STOCK DEPOT: %s" % city_name.to_upper()
	location_lbl.add_theme_font_size_override("font_size", 11)
	location_lbl.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443, 0.85)) # emerald green
	commodity_vbox.add_child(location_lbl)
	
	var commodities = [
		{
			"type": "DIESEL",
			"name": "⛽ DIESEL FUEL",
			"current": float(active_garage.get("dieselStorage", 0.0)),
			"max": float(active_garage.get("maxDiesel", 5000.0)),
			"unit": "L",
			"buy_amounts": [100.0, 1000.0],
			"min_price": 1.10,
			"max_price": 2.50
		},
		{
			"type": "ELECTRICITY",
			"name": "⚡ GRID POWER (EV)",
			"current": float(active_garage.get("electricityStorage", 0.0)),
			"max": float(active_garage.get("maxElectricity", 1000.0)),
			"unit": "kWh",
			"buy_amounts": [100.0, 500.0],
			"min_price": 0.12,
			"max_price": 0.45
		},
		{
			"type": "ADBLUE",
			"name": "🧪 ADBLUE AGENT",
			"current": float(active_garage.get("adblueStorage", 0.0)),
			"max": float(active_garage.get("maxAdblue", 500.0)),
			"unit": "L",
			"buy_amounts": [50.0, 200.0],
			"min_price": 0.55,
			"max_price": 1.45
		},
		{
			"type": "CO2_ALLOWANCE",
			"name": "🌱 CO2 LIMIT PERMITS",
			"current": float(active_garage.get("co2Allowances", 0.0)),
			"max": -1.0, # Electronic, no storage cap
			"unit": "Tons",
			"buy_amounts": [1.0, 10.0],
			"min_price": 45.0,
			"max_price": 165.0
		}
	]
	
	for comm in commodities:
		_render_commodity_item(comm, garage_id)

func _render_commodity_item(comm: Dictionary, garage_id: String) -> void:
	var item_vbox = VBoxContainer.new()
	item_vbox.add_theme_constant_override("separation", 3)
	commodity_vbox.add_child(item_vbox)
	
	# Name & Price Row
	var name_row = HBoxContainer.new()
	item_vbox.add_child(name_row)
	
	var name_lbl = Label.new()
	name_lbl.text = comm.name
	name_lbl.add_theme_font_size_override("font_size", 11)
	name_lbl.add_theme_color_override("font_color", Color(1, 1, 1, 0.95))
	name_row.add_child(name_lbl)
	
	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_row.add_child(spacer)
	
	var price_lbl = Label.new()
	var prices_data = market_prices.get(comm.type, { "price": 1.0, "prev_price": 1.0 })
	var curr_price = prices_data.price
	var prev_price = prices_data.prev_price
	
	price_lbl.text = "$%.2f" % curr_price
	price_lbl.add_theme_font_size_override("font_size", 11)
	
	# Visual Flashing Arrows for Price fluctuation
	if curr_price > prev_price:
		price_lbl.text += " ▲"
		price_lbl.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443)) # Emerald Green up
	elif curr_price < prev_price:
		price_lbl.text += " ▼"
		price_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235)) # Crimson Red down
	else:
		price_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.65)) # Stable Grey
	name_row.add_child(price_lbl)
	
	# Stockpile bar and details
	var has_limit = comm.max > 0
	var stock_row = HBoxContainer.new()
	item_vbox.add_child(stock_row)
	
	var stock_lbl = Label.new()
	if has_limit:
		stock_lbl.text = "Depot: %.1f/%.0f %s" % [comm.current, comm.max, comm.unit]
	else:
		stock_lbl.text = "Electronic: %.4f %s" % [comm.current, comm.unit]
	stock_lbl.add_theme_font_size_override("font_size", 10)
	stock_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.6))
	stock_row.add_child(stock_lbl)
	
	if has_limit:
		var fill_pct = int((comm.current / comm.max) * 100.0)
		item_vbox.add_child(_build_health_bar("RESERVES", fill_pct))
		
	# Chart telemetry bar (displays where the price sits relative to its min/max bounds)
	# This represents a beautiful spatial mini-chart that visualizes live volatility trends
	var price_range = comm.max_price - comm.min_price
	var price_pct = int(((curr_price - comm.min_price) / price_range) * 100.0)
	price_pct = clamp(price_pct, 0, 100)
	
	var telemetry_row = HBoxContainer.new()
	item_vbox.add_child(telemetry_row)
	
	var min_lbl = Label.new()
	min_lbl.text = "Min: $%.2f" % comm.min_price
	min_lbl.add_theme_font_size_override("font_size", 8)
	min_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.35))
	telemetry_row.add_child(min_lbl)
	
	var tel_bar = PanelContainer.new()
	tel_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tel_bar.custom_minimum_size.y = 4
	var t_style = StyleBoxFlat.new()
	t_style.bg_color = Color(0.09, 0.09, 0.11, 1.0)
	t_style.set_corner_radius_all(2)
	tel_bar.add_theme_stylebox_override("panel", t_style)
	
	var t_fill = PanelContainer.new()
	t_fill.size_flags_horizontal = Control.SIZE_FILL
	var tf_style = StyleBoxFlat.new()
	tf_style.bg_color = Color(0.925, 0.607, 0.141, 0.75) # neon orange indicator
	tf_style.set_corner_radius_all(2)
	t_fill.add_theme_stylebox_override("panel", tf_style)
	t_fill.anchor_right = float(price_pct) / 100.0
	t_fill.offset_right = 0
	
	tel_bar.add_child(t_fill)
	telemetry_row.add_child(tel_bar)
	
	var max_lbl = Label.new()
	max_lbl.text = "Max: $%.2f" % comm.max_price
	max_lbl.add_theme_font_size_override("font_size", 8)
	max_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.35))
	telemetry_row.add_child(max_lbl)
	
	# Action Buy Refill Buttons
	var buy_btn_row = HBoxContainer.new()
	buy_btn_row.add_theme_constant_override("separation", 6)
	item_vbox.add_child(buy_btn_row)
	
	for amt in comm.buy_amounts:
		var buy_btn = Button.new()
		var is_co2 = comm.type == "CO2_ALLOWANCE"
		var unit_label = "T" if is_co2 else comm.unit
		buy_btn.text = "+%.0f %s ($%.0f)" % [amt, unit_label, amt * curr_price]
		buy_btn.add_theme_font_size_override("font_size", 9)
		buy_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		
		var b_style = StyleBoxFlat.new()
		b_style.bg_color = Color(0.925, 0.607, 0.141, 0.08) # amber transparent
		b_style.border_color = Color(0.925, 0.607, 0.141, 0.35)
		b_style.border_width_bottom = 1
		b_style.set_corner_radius_all(4)
		buy_btn.add_theme_stylebox_override("normal", b_style)
		buy_btn.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		
		buy_btn.pressed.connect(_buy_commodity.bind(garage_id, comm.type, amt))
		buy_btn_row.add_child(buy_btn)
		
	var sep_bottom = HSeparator.new()
	sep_bottom.modulate = Color(1, 1, 1, 0.15)
	item_vbox.add_child(sep_bottom)

func _buy_commodity(garage_id: String, commodity_type: String, amount: float) -> void:
	_log("Ordering stockpile refill: %.0f %s..." % [amount, commodity_type], Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_commodity_buy_response.bind(http))
	var body = JSON.stringify({
		"garageId": garage_id,
		"commodityType": commodity_type,
		"amount": amount
	})
	http.request(
		api_base + "/commodity/buy",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

func _on_commodity_buy_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		var cost = float(data.get("totalCost", 0))
		_log("✓ Stockpile refilled! Cost: $%.2f legal cash deducted." % cost, Color(0.180, 0.803, 0.443))
		# Re-fetch fleet, which will naturally update local stock levels in GameState and redraw
		_fetch_fleet()
	else:
		var err_msg = "Transaction rejected by market regulatory."
		if data and data is Dictionary and data.has("message"):
			err_msg = data.message
		_log("⛔ Refill failed: " + err_msg, Color(0.901, 0.298, 0.235))


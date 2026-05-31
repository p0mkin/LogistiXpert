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

# ==========================================
# RESPONSE HANDLERS
# ==========================================
func _on_fleet_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if response_code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data:
			# Garages contain trucks; flatten into truck list
			trucks_data = []
			if data is Array:
				for garage in data:
					if garage.has("trucks"):
						for truck in garage.trucks:
							trucks_data.append(truck)
			_render_fleet_list()
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
	
	if impound:
		detail_status.text = "STATUS: IMPOUNDED"
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
	
	action_btn_1.text = "🔧 REPAIR ENGINE ($1800)"
	action_btn_1.show()
	action_btn_2.text = "🛞 REPLACE TIRES ($900)"
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

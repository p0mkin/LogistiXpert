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

var api_base: String:
	get: return NetworkManager.HTTP_URL
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
var price_histories: Dictionary = {
	"DIESEL": [],
	"ELECTRICITY": [],
	"ADBLUE": [],
	"CO2_ALLOWANCE": []
}

# Programmatically Nested Custom Gauges & Graph Renderers
class ArcGauge extends Control:
	var value: float = 0.0
	var max_value: float = 100.0
	var label_unit: String = "L"
	
	func _draw() -> void:
		var center = size * 0.5
		var radius = min(size.x, size.y) * 0.38
		var width = 10.0
		
		# Draw grey backdrop arc from -PI * 0.8 to PI * 0.8
		var start_angle = -PI * 0.8
		var end_angle = PI * 0.8
		draw_arc(center, radius, start_angle, end_angle, 64, Color(0.1, 0.1, 0.13, 1.0), width, true)
		
		# Draw active colored arc based on value / max_value
		var fill_ratio = clamp(value / max_value, 0.0, 1.0)
		var fill_end_angle = start_angle + (end_angle - start_angle) * fill_ratio
		
		var color = Color(0.2, 0.9, 0.7, 1.0) # neon cyan
		if label_unit == "kWh": color = Color(0.65, 0.45, 1.0, 1.0) # EV violet
		elif label_unit == "L" and max_value < 1000.0: color = Color(0.18, 0.8, 0.44, 1.0) # adblue green
		elif label_unit == "Tons" or label_unit == "T": color = Color(0.95, 0.75, 0.15, 1.0) # Amber
		
		if fill_ratio > 0.0:
			draw_arc(center, radius, start_angle, fill_end_angle, 64, color, width, true)
			
			# Glowing tip marker (white core + colored halo)
			var tip_angle = fill_end_angle
			var tip_pos = center + Vector2(cos(tip_angle), sin(tip_angle)) * radius
			draw_circle(tip_pos, width * 0.5, Color(1, 1, 1, 0.95))
			draw_circle(tip_pos, width * 1.0, Color(color.r, color.g, color.b, 0.45))
			
		# Outer graduation tick marks
		var outer_radius = radius + width + 5.0
		var tick_col = Color(color.r, color.g, color.b, 0.22)
		for i in range(11):
			var t_ratio = float(i) / 10.0
			var t_angle = start_angle + (end_angle - start_angle) * t_ratio
			var tick_start = center + Vector2(cos(t_angle), sin(t_angle)) * outer_radius
			var tick_end = center + Vector2(cos(t_angle), sin(t_angle)) * (outer_radius + 4.0)
			draw_line(tick_start, tick_end, tick_col, 1.5)

class LineGraph extends Control:
	var points: Array = []
	var min_val: float = 0.0
	var max_val: float = 100.0
	var graph_color: Color = Color(0.95, 0.75, 0.15, 1.0) # Curved Amber palette primary
	
	func _draw() -> void:
		if points.size() < 2:
			return
			
		# Draw a light grid background
		var grid_color = Color(0.1, 0.12, 0.16, 0.4)
		for i in range(4):
			var y_line = (size.y / 3.0) * i
			draw_line(Vector2(0, y_line), Vector2(size.x, y_line), grid_color, 1.0)
		for j in range(6):
			var x_line = (size.x / 5.0) * j
			draw_line(Vector2(x_line, 0), Vector2(x_line, size.y), grid_color, 1.0)
			
		# Draw tiny axis labels
		var font = get_theme_font("font")
		if font:
			# Y-axis Max
			draw_string(font, Vector2(6, 12), "$%.2f" % max_val, HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color(graph_color.r, graph_color.g, graph_color.b, 0.6))
			# Y-axis Min
			draw_string(font, Vector2(6, size.y - 4), "$%.2f" % min_val, HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color(graph_color.r, graph_color.g, graph_color.b, 0.6))
			
		# Tiny high-tech crosshairs at grid intersections
		for i in range(1, 3):
			var y_line = (size.y / 3.0) * i
			for j in range(1, 5):
				var x_line = (size.x / 5.0) * j
				var inter = Vector2(x_line, y_line)
				draw_line(inter - Vector2(4, 0), inter + Vector2(4, 0), Color(graph_color.r, graph_color.g, graph_color.b, 0.25), 1.0)
				draw_line(inter - Vector2(0, 4), inter + Vector2(0, 4), Color(graph_color.r, graph_color.g, graph_color.b, 0.25), 1.0)
			
		# Map points onto the Control's coordinate space
		var mapped_points: Array = []
		var range_val = max(max_val - min_val, 0.01)
		
		for i in range(points.size()):
			var val = points[i]
			var x = (float(i) / (points.size() - 1)) * size.x
			# Invert Y coordinate because Godot runs 0 top, height bottom
			var y = size.y - ((val - min_val) / range_val) * size.y
			mapped_points.append(Vector2(x, y))
			
		# Draw glowing vertical fill gradient polygon under the lines
		var poly_pts: PackedVector2Array = PackedVector2Array()
		var poly_cols: PackedColorArray = PackedColorArray()
		
		# Bottom-left starting point
		poly_pts.append(Vector2(mapped_points[0].x, size.y))
		poly_cols.append(Color(graph_color.r, graph_color.g, graph_color.b, 0.0))
		
		# All mapped points
		for p in mapped_points:
			poly_pts.append(p)
			poly_cols.append(Color(graph_color.r, graph_color.g, graph_color.b, 0.15)) # Low-opacity fill top
			
		# Bottom-right ending point
		poly_pts.append(Vector2(mapped_points[mapped_points.size() - 1].x, size.y))
		poly_cols.append(Color(graph_color.r, graph_color.g, graph_color.b, 0.0))
		
		# Draw the filled polygon with the vertical gradient colors
		draw_polygon(poly_pts, poly_cols)
		
		# Draw lines connecting mapped coordinates
		for i in range(mapped_points.size() - 1):
			draw_line(mapped_points[i], mapped_points[i + 1], graph_color, 2.5, true)
			# Ambient outer glow line
			draw_line(mapped_points[i], mapped_points[i + 1], Color(graph_color.r, graph_color.g, graph_color.b, 0.25), 4.5, true)
			
		# Draw circle markers at each point
		for i in range(mapped_points.size()):
			var p = mapped_points[i]
			var val = points[i]
			
			# Determine marker color: green if lower half, red if high peak
			var ratio = (val - min_val) / range_val
			var marker_col = Color(0.2, 0.9, 0.7) if ratio < 0.5 else Color(1.0, 0.25, 0.25) # Cyber Cyan or Crimson
			
			draw_circle(p, 4.0, marker_col)
			# Outer glow ring
			draw_circle(p, 6.0, Color(marker_col.r, marker_col.g, marker_col.b, 0.35))


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
	
	# Programmatically inject a header container and close button inside DetailInner
	var title_hbox = HBoxContainer.new()
	title_hbox.name = "TitleHBox"
	title_hbox.add_theme_constant_override("separation", 10)
	detail_inner.remove_child(detail_title)
	title_hbox.add_child(detail_title)
	detail_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	
	var close_btn = Button.new()
	close_btn.name = "CloseBtn"
	close_btn.text = " ✕ "
	close_btn.flat = true
	close_btn.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	close_btn.add_theme_color_override("font_hover_color", Color(1.0, 0.4, 0.4))
	close_btn.add_theme_font_size_override("font_size", 14)
	close_btn.pressed.connect(func():
		detail_panel.hide()
		selected_truck = {}
		selected_driver = {}
	)
	title_hbox.add_child(close_btn)
	detail_inner.add_child(title_hbox)
	detail_inner.move_child(title_hbox, 0)

	if not detail_inner.has_node("ActionBtn3"):
		action_btn_3 = Button.new()
		action_btn_3.name = "ActionBtn3"
		action_btn_3.theme_type_variation = "Button"
		action_btn_3.add_theme_font_size_override("font_size", 12)
		_style_btn(action_btn_3, Color(0.2, 0.9, 0.7))
		action_btn_3.pressed.connect(_on_action_3)
		detail_inner.add_child(action_btn_3)
	else:
		action_btn_3 = detail_inner.get_node("ActionBtn3")
		_style_btn(action_btn_3, Color(0.2, 0.9, 0.7))
	action_btn_3.hide()
	
	# Theme top level controls
	_style_panel(detail_panel, Color(0.2, 0.9, 0.7)) # Cyber Cyan detail panel
	_style_btn(back_btn, Color(1.0, 0.25, 0.25)) # Crimson warnings for exit
	_style_btn(hire_btn, Color(0.95, 0.75, 0.15)) # Financial Amber for recruitment
	_style_btn(action_btn_1, Color(0.2, 0.9, 0.7))
	_style_btn(action_btn_2, Color(0.2, 0.9, 0.7))
	
	# Dynamic Commodity Panel Setup
	_prepopulate_price_histories()
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
		else:
			_log("Driver roster loaded with invalid schema format.", Color(0.901, 0.298, 0.235))
	else:
		_log("Driver roster load failed (HTTP %d)." % response_code, Color(0.901, 0.298, 0.235))

func _on_repair_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log("Repair complete: " + data.get("message", "OK"), Color(0.180, 0.803, 0.443))
		UIEffects.play_success()
		_fetch_fleet()
	else:
		_log("Repair failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

func _on_roadside_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		var charge = float(data.get("totalCharge", 0))
		GameState.update_balances(-charge, 0.0)
		_log("✓ Roadside repair complete! Cost: $%.0f (emergency surcharge applied)." % charge, Color(0.180, 0.803, 0.443))
		UIEffects.play_success()
		_fetch_fleet()
	else:
		_log("Roadside repair failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

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
		UIEffects.play_success()
		_fetch_fleet()
	else:
		var required = float(data.get("required", 0))
		if required > 0:
			_log("⛔ Insufficient funds for impound release. Need: $%.0f" % required, Color(0.901, 0.298, 0.235))
		else:
			_log("Release failed: " + data.get("error", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

func _on_stimulant_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log(data.get("message", "Stimulant administered."), Color(0.607, 0.349, 0.713))
		UIEffects.play_smuggle()
		_fetch_drivers()
	else:
		_log("Refused: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

func _on_rest_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log("Rest rotation complete. Fatigue cleared.", Color(0.180, 0.803, 0.443))
		UIEffects.play_success()
		_fetch_drivers()
	else:
		_log("Rest failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

func _on_hire_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 201:
		var d = data.get("driver", {})
		_log("Recruited: %s (%s) — Loyalty: %d" % [d.get("name","?"), d.get("trait","?"), d.get("loyalty", 0)], Color(0.180, 0.803, 0.443))
		GameState.update_balances(-2500.0, 0.0)
		UIEffects.play_success()
		_fetch_drivers()
	else:
		_log("Hire failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

func _on_assign_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		_log(data.get("message", "Driver assignment updated."), Color(0.180, 0.803, 0.443))
		UIEffects.play_success()
		_fetch_drivers()
		_fetch_fleet()
	else:
		_log("Assignment failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

func _on_spoof_response(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if response_code == 200:
		GameState.update_balances(0.0, -3500.0)
		_log("Tacho Spoof installed. Tachograph reads 0.0h — forged compliance active.", Color(0.607, 0.349, 0.713))
		UIEffects.play_smuggle()
		_fetch_drivers()
	else:
		_log("Spoof failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))
		UIEffects.play_error()

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
	
	# Color border dynamically reflecting truck health/damage or active state
	var engine_pct = int(truck.get("engineHealth", 100))
	var tire_pct = int(truck.get("tireWear", 100))
	var border_color = Color(0.2, 0.9, 0.7) # Cyber Cyan default
	
	if truck.get("isImpounded", false):
		border_color = Color(1.0, 0.25, 0.25) # Crimson warning
	elif engine_pct < 40 or tire_pct < 40:
		border_color = Color(0.95, 0.75, 0.15) # Financial Amber warning
	elif truck.has("activeRoute"):
		border_color = Color(0.65, 0.45, 1.0) # Underworld Purple active route
		
	_style_panel(panel, border_color)
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
	_style_btn(btn, border_color)
	btn.pressed.connect(_select_truck.bind(truck))
	vbox.add_child(btn)
	
	return panel

func _build_driver_card(driver: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	
	var driver_name = "Unknown Driver"
	if driver.get("name") != null:
		driver_name = str(driver.get("name", ""))
	if driver_name.is_empty():
		driver_name = "Unknown Driver"
	var driver_trait = "BALANCED"
	if driver.get("trait") != null:
		driver_trait = str(driver.get("trait", ""))
	if driver_trait.is_empty():
		driver_trait = "BALANCED"
	var loyalty = 0
	if driver.get("loyalty") != null:
		loyalty = int(driver.get("loyalty", 0))
	var fatigue = 0
	if driver.get("fatigue") != null:
		fatigue = int(driver.get("fatigue", 0))
	var stimulated = false
	if driver.get("isStimulated") != null:
		stimulated = bool(driver.get("isStimulated", false))
	var tacho = 0.0
	if driver.get("tachoHours") != null:
		tacho = float(driver.get("tachoHours", 0.0))
	
	# Color border by loyalty tier and fatigue
	var border_color = Color(0.65, 0.45, 1.0) # Underworld Purple default
	if fatigue > 70:
		border_color = Color(1.0, 0.25, 0.25) # Crimson (dangerous exhaustion)
	elif loyalty >= 80:
		border_color = Color(0.65, 0.45, 1.0) # Purple (high loyalty/illicit elite)
	elif loyalty >= 60:
		border_color = Color(0.2, 0.9, 0.7) # Cyan (reliable)
	else:
		border_color = Color(0.95, 0.75, 0.15) # Amber (unreliable warning)
		
	_style_panel(panel, border_color)
	panel.custom_minimum_size.x = 400
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 5)
	panel.add_child(vbox)
	
	# Driver name + trait badge
	var header = HBoxContainer.new()
	var name_lbl = Label.new()
	name_lbl.text = driver_name
	name_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	name_lbl.add_theme_font_size_override("font_size", 14)
	header.add_child(name_lbl)
	
	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)
	
	var trait_lbl = Label.new()
	trait_lbl.text = "[%s]" % driver_trait
	trait_lbl.add_theme_font_size_override("font_size", 11)
	match driver_trait:
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
	
	if stimulated:
		stim_lbl.text = "⚗ STIMULANT ACTIVE · Tacho: %.1fh" % tacho
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
	_style_btn(btn, border_color)
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
	
	# Intermediate plain Control wrapper to escape PanelContainer auto-layout override
	var bar_area = Control.new()
	bar_area.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bg.add_child(bar_area)
	
	var fill = PanelContainer.new()
	fill.custom_minimum_size.y = 8
	fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	fill.anchor_right = clampf(float(pct) / 100.0, 0.0, 1.0)
	fill.offset_right = 0
	
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
	
	bar_area.add_child(fill)
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

	# Dynamic Programmatic Vector Blueprint
	var blueprint = VehicleBlueprint.new()
	blueprint.manufacturer = truck.get("manufacturer", "SCARFIA")
	blueprint.cab_type = truck.get("cabType", "STANDARD")
	blueprint.payload_type = truck.get("payloadType", "DRY")
	blueprint.tuning_tier = truck.get("tuningTier", "STOCK")
	blueprint.health_pct = int(truck.get("engineHealth", 100))
	blueprint.custom_minimum_size = Vector2(380, 140) # Compact size for detail panel
	detail_body.add_child(blueprint)

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
		_style_btn(release_btn, Color(0.95, 0.75, 0.15))
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
		_style_btn(roadside_btn, Color(0.95, 0.75, 0.15))
		roadside_btn.pressed.connect(_roadside_repair.bind(truck.get("id", "")))
		detail_body.add_child(roadside_btn)

		action_btn_1.hide()
		action_btn_2.hide()
		if action_btn_3: action_btn_3.hide()
		return

	action_btn_1.text = "🔧 REPAIR ENGINE ($1800)"
	action_btn_1.show()
	_style_btn(action_btn_1, Color(0.2, 0.9, 0.7)) # Cyan repair action
	action_btn_2.text = "🛥 REPLACE TIRES ($900)"
	action_btn_2.show()
	_style_btn(action_btn_2, Color(0.2, 0.9, 0.7)) # Cyan repair action
	if action_btn_3: action_btn_3.hide()

func _select_driver(driver: Dictionary) -> void:
	selected_driver = driver
	selected_truck = {}
	mode = "drivers"
	detail_panel.show()
	
	# Extract and coerce all fields safely to guard against nulls
	var driver_name = "Driver"
	if driver.get("name") != null:
		driver_name = str(driver.get("name", ""))
	if driver_name.is_empty():
		driver_name = "Driver"
	var driver_trait = "BALANCED"
	if driver.get("trait") != null:
		driver_trait = str(driver.get("trait", ""))
	if driver_trait.is_empty():
		driver_trait = "BALANCED"
	var loyalty = 0
	if driver.get("loyalty") != null:
		loyalty = int(driver.get("loyalty", 0))
	var fatigue = 0
	if driver.get("fatigue") != null:
		fatigue = int(driver.get("fatigue", 0))
	var stimulated = false
	if driver.get("isStimulated") != null:
		stimulated = bool(driver.get("isStimulated", false))
	var tacho = 0.0
	if driver.get("tachoHours") != null:
		tacho = float(driver.get("tachoHours", 0.0))
	var charisma = 0
	if driver.get("charisma") != null:
		charisma = int(driver.get("charisma", 0))
	
	detail_title.text = driver_name
	detail_status.text = "TRAIT: " + driver_trait
	detail_status.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	
	for child in detail_body.get_children():
		child.queue_free()
	
	var info_lines = [
		"Loyalty: %d / 100" % loyalty,
		"Fatigue: %d%%" % fatigue,
		"Tacho Hours: %.1f h" % tacho,
		"Stimulated: %s" % ("YES ⚗" if stimulated else "No"),
		"Charisma: %d" % charisma,
	]
	
	for line in info_lines:
		var lbl = Label.new()
		lbl.text = line
		lbl.add_theme_font_size_override("font_size", 12)
		lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.85))
		detail_body.add_child(lbl)
	
	action_btn_1.text = "⚗ ADMINISTER STIMULANT ($500 BM)"
	action_btn_1.show()
	_style_btn(action_btn_1, Color(0.65, 0.45, 1.0)) # Purple stimulant action
	action_btn_2.text = "🛌 SCHENGEN MOTEL REST ($250)"
	action_btn_2.show()
	_style_btn(action_btn_2, Color(0.2, 0.9, 0.7)) # Cyan rest action
	if action_btn_3:
		action_btn_3.text = "🛌 EASTERN CABIN REST (FREE)"
		action_btn_3.show()
		_style_btn(action_btn_3, Color(0.2, 0.9, 0.7)) # Cyan rest action

	# Show Tacho Spoof button if tacho > 7h
	var tacho_h = float(driver.get("tachoHours", 0.0))
	if tacho_h > 7.0:
		var spoof_btn = Button.new()
		spoof_btn.text = "💾 INSTALL TACHO SPOOF ($3500 BM) — Tacho: %.1fh" % tacho_h
		spoof_btn.add_theme_font_size_override("font_size", 11)
		_style_btn(spoof_btn, Color(0.65, 0.45, 1.0))
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
		_style_btn(unassign_btn, Color(1.0, 0.25, 0.25))
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
			_style_btn(do_assign_btn, Color(0.180, 0.803, 0.443))
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
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _apply_theme() -> void:
	# Purge default background blocks if present in the tree
	if has_node("Background"):
		get_node("Background").visible = false
	elif has_node("Bg"):
		get_node("Bg").visible = false
		
	# Dynamically instantiate and register CyberGridBackground at base rendering layer
	var bg = CyberGridBackground.new()
	bg.primary_color = Color(0.2, 0.9, 0.7, 0.1) # Cyber Cyan theme
	bg.accent_color = Color(0.95, 0.75, 0.15, 0.08) # Financial Amber accent
	bg.base_color = Color(0.04, 0.04, 0.06, 1.0)
	add_child(bg)
	move_child(bg, 0)

func _style_panel(panel: PanelContainer, accent_col: Color) -> void:
	if not panel: return
	var s = StyleBoxFlat.new()
	s.bg_color = Color(0.055, 0.063, 0.078, 0.85) # Glassmorphic Translucent
	s.border_color = accent_col
	s.border_width_left = 3 # Accent colored boundary edge
	s.border_width_bottom = 1
	s.border_width_right = 1
	s.border_width_top = 1
	s.set_corner_radius_all(6)
	s.content_margin_left = 16
	s.content_margin_right = 16
	s.content_margin_top = 12
	s.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", s)

func _style_btn(btn: Button, accent_col: Color, is_selected: bool = false) -> void:
	if not btn: return
	var sb_normal = StyleBoxFlat.new()
	var sb_hover = StyleBoxFlat.new()
	var sb_pressed = StyleBoxFlat.new()
	var sb_disabled = StyleBoxFlat.new()
	
	if is_selected:
		sb_normal.bg_color = Color(accent_col.r * 0.15, accent_col.g * 0.15, accent_col.b * 0.15, 0.8)
		sb_normal.border_color = accent_col
		sb_normal.border_width_left = 2; sb_normal.border_width_bottom = 2
		sb_normal.border_width_right = 2; sb_normal.border_width_top = 2
		
		sb_hover.bg_color = Color(accent_col.r * 0.25, accent_col.g * 0.25, accent_col.b * 0.25, 0.9)
		sb_hover.border_color = accent_col
		sb_hover.border_width_left = 2; sb_hover.border_width_bottom = 2
		sb_hover.border_width_right = 2; sb_hover.border_width_top = 2
	else:
		sb_normal.bg_color = Color(accent_col.r * 0.08, accent_col.g * 0.08, accent_col.b * 0.08, 0.6)
		sb_normal.border_color = Color(accent_col.r, accent_col.g, accent_col.b, 0.3)
		sb_normal.border_width_left = 1; sb_normal.border_width_bottom = 1
		sb_normal.border_width_right = 1; sb_normal.border_width_top = 1
		
		sb_hover.bg_color = Color(accent_col.r * 0.14, accent_col.g * 0.14, accent_col.b * 0.14, 0.8)
		sb_hover.border_color = Color(accent_col.r, accent_col.g, accent_col.b, 0.6)
		sb_hover.border_width_left = 1; sb_hover.border_width_bottom = 1
		sb_hover.border_width_right = 1; sb_hover.border_width_top = 1
		
	for sb in [sb_normal, sb_hover, sb_pressed]:
		sb.set_corner_radius_all(4)
		
	sb_pressed.bg_color = Color(accent_col.r * 0.3, accent_col.g * 0.3, accent_col.b * 0.3, 1.0)
	sb_pressed.border_color = accent_col
	sb_pressed.border_width_all(2)
	sb_pressed.set_corner_radius_all(4)
	
	sb_disabled.bg_color = Color(0.04, 0.04, 0.05, 0.3)
	sb_disabled.border_color = Color(0.1, 0.1, 0.12, 0.2)
	sb_disabled.border_width_all(1)
	sb_disabled.set_corner_radius_all(4)
	
	btn.add_theme_stylebox_override("normal", sb_normal)
	btn.add_theme_stylebox_override("hover", sb_hover)
	btn.add_theme_stylebox_override("pressed", sb_pressed)
	btn.add_theme_stylebox_override("disabled", sb_disabled)
	btn.add_theme_color_override("font_color", accent_col)

func _fmt_cash(val: float) -> String:
	if val >= 1000000.0:
		return "%.2fM" % (val / 1000000.0)
	elif val >= 1000.0:
		return "%.1fk" % (val / 1000.0)
	else:
		return "%.2f" % val

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
				
				# Maintain rolling price history of 15 elements
				if price_histories.has(type):
					price_histories[type].append(new_price)
					if price_histories[type].size() > 15:
						price_histories[type].remove_at(0)
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
		
	# Operations button right under the reserves bar
	var ops_btn = Button.new()
	ops_btn.text = "⛽  DEPOT REFUEL OPERATIONS ➔" if comm.type != "CO2_ALLOWANCE" else "🌱  CO2 ALLOWANCE OPERATIONS ➔"
	ops_btn.add_theme_font_size_override("font_size", 10)
	ops_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	
	var ops_style = StyleBoxFlat.new()
	var ops_color = Color(0.2, 0.8, 1.0) # cyan
	if comm.type == "CO2_ALLOWANCE":
		ops_color = Color(0.180, 0.803, 0.443) # emerald green
	
	ops_style.bg_color = Color(ops_color.r, ops_color.g, ops_color.b, 0.08)
	ops_style.border_color = Color(ops_color.r, ops_color.g, ops_color.b, 0.35)
	ops_style.border_width_bottom = 1
	ops_style.set_corner_radius_all(4)
	ops_btn.add_theme_stylebox_override("normal", ops_style)
	ops_btn.add_theme_color_override("font_color", ops_color)
	
	ops_btn.pressed.connect(func(): _open_commodity_refill_modal(comm, garage_id))
	item_vbox.add_child(ops_btn)
		
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
		UIEffects.play_refuel()
		# Re-fetch fleet, which will naturally update local stock levels in GameState and redraw
		_fetch_fleet()
	else:
		var err_msg = "Transaction rejected by market regulatory."
		if data and data is Dictionary and data.has("message"):
			err_msg = data.message
		_log("⛔ Refill failed: " + err_msg, Color(0.901, 0.298, 0.235))
		UIEffects.play_error()


# ==========================================
# REFILL OPERATIONS MODAL & STORAGE UPGRADES
# ==========================================
func _prepopulate_price_histories() -> void:
	# Prepopulate price histories with 15 slightly random-walk-drifted price values
	# Diesel: $1.30–$1.80, start around 1.50
	var d_price = 1.50
	# Electricity: $0.15–$0.35, start around 0.22
	var e_price = 0.22
	# AdBlue: $0.60–$1.20, start around 0.85
	var a_price = 0.85
	# CO2_ALLOWANCE: $65.0–$115.0, start around 85.0
	var c_price = 85.0
	
	for i in range(15):
		d_price = clamp(d_price + randf_range(-0.04, 0.04), 1.30, 1.80)
		e_price = clamp(e_price + randf_range(-0.015, 0.015), 0.15, 0.35)
		a_price = clamp(a_price + randf_range(-0.03, 0.03), 0.60, 1.20)
		c_price = clamp(c_price + randf_range(-2.5, 2.5), 65.0, 115.0)
		
		price_histories["DIESEL"].append(d_price)
		price_histories["ELECTRICITY"].append(e_price)
		price_histories["ADBLUE"].append(a_price)
		price_histories["CO2_ALLOWANCE"].append(c_price)

func _open_commodity_refill_modal(comm: Dictionary, garage_id: String) -> void:
	var modal_overlay = Control.new()
	modal_overlay.name = "RefillModalOverlay"
	modal_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	
	# Backdrop shadow block
	var backdrop = PanelContainer.new()
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var backdrop_style = StyleBoxFlat.new()
	backdrop_style.bg_color = Color(0.04, 0.04, 0.06, 0.82)
	backdrop.add_theme_stylebox_override("panel", backdrop_style)
	modal_overlay.add_child(backdrop)
	
	# Centered Modal Frame
	var dialog = PanelContainer.new()
	dialog.custom_minimum_size = Vector2(850, 480)
	dialog.anchor_left = 0.5
	dialog.anchor_top = 0.5
	dialog.anchor_right = 0.5
	dialog.anchor_bottom = 0.5
	dialog.grow_horizontal = Control.GROW_DIRECTION_BOTH
	dialog.grow_vertical = Control.GROW_DIRECTION_BOTH
	dialog.offset_left = -425
	dialog.offset_top = -240
	dialog.offset_right = 425
	dialog.offset_bottom = 240
	
	var dialog_style = StyleBoxFlat.new()
	dialog_style.bg_color = Color(0.055, 0.063, 0.078, 1.0)
	dialog_style.border_color = Color(0.925, 0.607, 0.141, 0.35) # Amber Neon
	dialog_style.border_width_left = 2
	dialog_style.border_width_right = 2
	dialog_style.border_width_top = 2
	dialog_style.border_width_bottom = 2
	dialog_style.set_corner_radius_all(8)
	dialog_style.content_margin_left = 24
	dialog_style.content_margin_right = 24
	dialog_style.content_margin_top = 20
	dialog_style.content_margin_bottom = 20
	dialog.add_theme_stylebox_override("panel", dialog_style)
	modal_overlay.add_child(dialog)
	
	var main_vbox = VBoxContainer.new()
	main_vbox.add_theme_constant_override("separation", 16)
	dialog.add_child(main_vbox)
	
	# Header
	var header_hbox = HBoxContainer.new()
	main_vbox.add_child(header_hbox)
	
	var title_label = Label.new()
	title_label.text = "◈ %s STORAGE & REFUEL OPERATIONS" % comm.name
	title_label.add_theme_font_size_override("font_size", 15)
	title_label.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141)) # Amber
	header_hbox.add_child(title_label)
	
	var header_spacer = Control.new()
	header_spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_hbox.add_child(header_spacer)
	
	var close_btn = Button.new()
	close_btn.text = " ✕ "
	close_btn.add_theme_font_size_override("font_size", 14)
	close_btn.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	close_btn.flat = true
	close_btn.pressed.connect(func(): modal_overlay.queue_free())
	header_hbox.add_child(close_btn)
	
	var modal_sep = HSeparator.new()
	modal_sep.modulate = Color(1, 1, 1, 0.2)
	main_vbox.add_child(modal_sep)
	
	# Splits Left (ArcGauge, Expansion) and Right (Graph, Slider, Cost)
	var columns_hbox = HBoxContainer.new()
	columns_hbox.add_theme_constant_override("separation", 32)
	columns_hbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	main_vbox.add_child(columns_hbox)
	
	# Left Panel
	var left_vbox = VBoxContainer.new()
	left_vbox.custom_minimum_size.x = 280
	left_vbox.add_theme_constant_override("separation", 16)
	left_vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	columns_hbox.add_child(left_vbox)
	
	var gauge_label = Label.new()
	gauge_label.text = "SILO STOCK LEVEL"
	gauge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	gauge_label.add_theme_font_size_override("font_size", 11)
	gauge_label.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	left_vbox.add_child(gauge_label)
	
	var arc_gauge = ArcGauge.new()
	arc_gauge.custom_minimum_size = Vector2(160, 160)
	arc_gauge.value = comm.current
	arc_gauge.max_value = comm.max if comm.max > 0 else 100.0
	arc_gauge.label_unit = comm.unit
	left_vbox.add_child(arc_gauge)
	
	var value_lbl = Label.new()
	if comm.max > 0:
		var pct = int((comm.current / comm.max) * 100.0)
		value_lbl.text = "%.1f / %.0f %s (%d%%)" % [comm.current, comm.max, comm.unit, pct]
	else:
		value_lbl.text = "%.4f %s" % [comm.current, comm.unit]
	value_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value_lbl.add_theme_font_size_override("font_size", 12)
	value_lbl.add_theme_color_override("font_color", Color(1, 1, 1, 0.95))
	left_vbox.add_child(value_lbl)
	
	var upgrade_btn = Button.new()
	upgrade_btn.custom_minimum_size.y = 40
	upgrade_btn.add_theme_font_size_override("font_size", 11)
	left_vbox.add_child(upgrade_btn)
	
	if comm.max <= 0:
		upgrade_btn.text = "ELECTRONIC COMMODITY\n(No Storage Limits)"
		upgrade_btn.disabled = true
	else:
		_update_capacity_button_state(comm.type, comm.max, upgrade_btn, garage_id, arc_gauge, value_lbl, comm)
		
	# Right Panel
	var right_vbox = VBoxContainer.new()
	right_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_vbox.add_theme_constant_override("separation", 14)
	columns_hbox.add_child(right_vbox)
	
	var chart_lbl = Label.new()
	chart_lbl.text = "HISTORICAL PRICE VOLATILITY (LAST 15 TRADING HOURS)"
	chart_lbl.add_theme_font_size_override("font_size", 11)
	chart_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	right_vbox.add_child(chart_lbl)
	
	var line_graph = LineGraph.new()
	line_graph.custom_minimum_size = Vector2(400, 150)
	line_graph.points = price_histories.get(comm.type, [])
	line_graph.min_val = comm.min_price
	line_graph.max_val = comm.max_price
	line_graph.graph_color = Color(0.925, 0.607, 0.141, 1.0)
	right_vbox.add_child(line_graph)
	
	var slider_label = Label.new()
	slider_label.text = "SELECT AMOUNT TO PURCHASE"
	slider_label.add_theme_font_size_override("font_size", 11)
	slider_label.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	right_vbox.add_child(slider_label)
	
	var slider_hbox = HBoxContainer.new()
	slider_hbox.add_theme_constant_override("separation", 12)
	right_vbox.add_child(slider_hbox)
	
	var amt_slider = HSlider.new()
	amt_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	
	var remaining_space = comm.max - comm.current if comm.max > 0 else 100.0
	if remaining_space < 0: remaining_space = 0.0
	
	amt_slider.min_value = 0.0
	if comm.max > 0:
		amt_slider.max_value = remaining_space
	else:
		var affordable_co2 = GameState.legal_balance / market_prices[comm.type]["price"]
		amt_slider.max_value = min(100.0, max(0.0, affordable_co2))
		
	if comm.type == "DIESEL":
		amt_slider.step = 10.0
	elif comm.type == "ELECTRICITY":
		amt_slider.step = 5.0
	elif comm.type == "ADBLUE":
		amt_slider.step = 5.0
	else:
		amt_slider.step = 0.1
		
	amt_slider.value = 0.0
	slider_hbox.add_child(amt_slider)
	
	var slider_val_lbl = Label.new()
	slider_val_lbl.text = "0 %s" % comm.unit
	slider_val_lbl.custom_minimum_size.x = 80
	slider_val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	slider_val_lbl.add_theme_font_size_override("font_size", 12)
	slider_val_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	slider_hbox.add_child(slider_val_lbl)
	
	var invoice_lbl = Label.new()
	invoice_lbl.text = "Total cost: $0.00  |  Remaining Cash: $%s" % _fmt_cash(GameState.legal_balance)
	invoice_lbl.add_theme_font_size_override("font_size", 12)
	invoice_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.85))
	right_vbox.add_child(invoice_lbl)
	
	var purchase_btn = Button.new()
	purchase_btn.text = "💳  EXECUTE REFILL ORDER"
	purchase_btn.custom_minimum_size.y = 42
	purchase_btn.add_theme_font_size_override("font_size", 13)
	purchase_btn.disabled = true
	right_vbox.add_child(purchase_btn)
	
	amt_slider.value_changed.connect(func(val):
		var unit_label = "Tons" if comm.type == "CO2_ALLOWANCE" else comm.unit
		slider_val_lbl.text = "%.1f %s" % [val, unit_label] if comm.type == "CO2_ALLOWANCE" else "%.0f %s" % [val, unit_label]
		
		var unit_price = market_prices[comm.type]["price"]
		var cost = val * unit_price
		var remaining_cash = GameState.legal_balance - cost
		
		if cost > 0:
			invoice_lbl.text = "Total Cost: $%.2f  |  Remaining Cash: $%s" % [cost, _fmt_cash(remaining_cash)]
		else:
			invoice_lbl.text = "Total Cost: $0.00  |  Remaining Cash: $%s" % _fmt_cash(GameState.legal_balance)
			
		if cost > GameState.legal_balance:
			invoice_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
			purchase_btn.disabled = true
			purchase_btn.text = "⛔ INSUFFICIENT LEGAL CASH"
		else:
			invoice_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.85))
			if val > 0:
				purchase_btn.disabled = false
				purchase_btn.text = "💳  EXECUTE REFILL ORDER ($%.2f)" % cost
				purchase_btn.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443))
			else:
				purchase_btn.disabled = true
				purchase_btn.text = "💳  EXECUTE REFILL ORDER"
				purchase_btn.remove_theme_color_override("font_color")
	)
	
	purchase_btn.pressed.connect(func():
		var val = amt_slider.value
		if val > 0:
			purchase_btn.disabled = true
			amt_slider.editable = false
			_buy_commodity_via_modal(garage_id, comm.type, val, modal_overlay, purchase_btn, amt_slider)
	)
	
	add_child(modal_overlay)

func _update_capacity_button_state(type: String, current_max: float, btn: Button, garage_id: String, arc_gauge: ArcGauge, value_lbl: Label, comm: Dictionary) -> void:
	var cost = 0
	var increment = 0
	var max_allowed = 0
	
	if type == "DIESEL":
		cost = 12500
		increment = 1000
		max_allowed = 20000
	elif type == "ELECTRICITY":
		cost = 8000
		increment = 500
		max_allowed = 10000
	elif type == "ADBLUE":
		cost = 5000
		increment = 250
		max_allowed = 5000
		
	if current_max >= max_allowed:
		btn.text = "🏬 MAX CAPACITY REACHED\n(Limit: %.0f %s)" % [max_allowed, comm.unit]
		btn.disabled = true
		btn.add_theme_color_override("font_color", Color(0.5, 0.5, 0.5, 1.0))
	else:
		btn.text = "▲ UPGRADE CAPACITY (+%.0f %s)\nCost: $%s Clean Cash" % [increment, comm.unit, _fmt_cash(cost)]
		if GameState.legal_balance < cost:
			btn.disabled = true
			btn.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235, 0.8))
		else:
			btn.disabled = false
			btn.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443))
			
			for conn in btn.pressed.get_connections():
				btn.pressed.disconnect(conn.callable)
				
			btn.pressed.connect(func():
				_upgrade_storage(garage_id, type, cost, increment, max_allowed, btn, arc_gauge, value_lbl, comm)
			)

func _upgrade_storage(garage_id: String, commodity_type: String, cost: float, increment: float, max_allowed: float, btn: Button, arc_gauge: ArcGauge, value_lbl: Label, comm: Dictionary) -> void:
	_log("Processing storage capacity upgrade...", Color(0.925, 0.607, 0.141))
	btn.disabled = true
	
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result, response_code, headers, body):
		http.queue_free()
		var data = JSON.parse_string(body.get_string_from_utf8())
		if response_code == 200:
			GameState.update_balances(-cost, 0.0)
			_log("✓ Silo storage capacity upgraded successfully!", Color(0.180, 0.803, 0.443))
			
			if not GameState.garages.is_empty():
				for g in GameState.garages:
					if g.get("id", "") == garage_id:
						if commodity_type == "DIESEL":
							g["maxDiesel"] = float(g.get("maxDiesel", 5000.0)) + increment
						elif commodity_type == "ELECTRICITY":
							g["maxElectricity"] = float(g.get("maxElectricity", 1000.0)) + increment
						elif commodity_type == "ADBLUE":
							g["maxAdblue"] = float(g.get("maxAdblue", 500.0)) + increment
						
						comm.max = g["maxDiesel"] if commodity_type == "DIESEL" else (g["maxElectricity"] if commodity_type == "ELECTRICITY" else g["maxAdblue"])
						break
			
			arc_gauge.max_value = comm.max
			arc_gauge.queue_redraw()
			
			var pct = int((comm.current / comm.max) * 100.0)
			value_lbl.text = "%.1f / %.0f %s (%d%%)" % [comm.current, comm.max, comm.unit, pct]
			
			_update_capacity_button_state(commodity_type, comm.max, btn, garage_id, arc_gauge, value_lbl, comm)
			_render_commodity_panel()
			_fetch_fleet()
		else:
			var err_msg = "Upgrade rejected by engineers."
			if data and data is Dictionary and data.has("message"):
				err_msg = data.message
			_log("⛔ Upgrade failed: " + err_msg, Color(0.901, 0.298, 0.235))
			btn.disabled = false
	)
	
	var body = JSON.stringify({
		"commodityType": commodity_type
	})
	http.request(
		api_base + "/garage/" + garage_id + "/upgrade-storage",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		body
	)

func _buy_commodity_via_modal(garage_id: String, commodity_type: String, amount: float, modal_overlay: Node, purchase_btn: Button, amt_slider: HSlider) -> void:
	_log("Ordering stockpile refill from modal: %.0f %s..." % [amount, commodity_type], Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(func(result, response_code, headers, body):
		http.queue_free()
		var data = JSON.parse_string(body.get_string_from_utf8())
		if response_code == 200:
			var cost = float(data.get("totalCost", 0))
			_log("✓ Stockpile refilled! Cost: $%.2f legal cash deducted." % cost, Color(0.180, 0.803, 0.443))
			UIEffects.play_refuel()
			modal_overlay.queue_free()
			_fetch_fleet()
		else:
			var err_msg = "Transaction rejected by market regulatory."
			if data and data is Dictionary and data.has("message"):
				err_msg = data.message
			_log("⛔ Refill failed: " + err_msg, Color(0.901, 0.298, 0.235))
			UIEffects.play_error()
			purchase_btn.disabled = false
			amt_slider.editable = true
	)
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


extends Control

# ====================================================
# BreakdownPanel.gd — Emergency Fleet Recovery Screen
# Roadside repair, garage tow, impound release
# Real-time fleet health monitor with danger alerts
# ====================================================

const BASE_URL = "http://localhost:3000"

var fleet_data: Array = []
var selected_truck: Dictionary = {}
var pending_action: String = ""  # "roadside" | "garage" | "release"

@onready var scene_root = $CanvasLayer
@onready var fleet_http = $FleetHTTPRequest
@onready var action_http = $ActionHTTPRequest
@onready var estimate_http = $EstimateHTTPRequest

func _ready() -> void:
	_build_ui()
	_fetch_fleet_status()

# ====================================================
# BUILD UI
# ====================================================
func _build_ui() -> void:
	var bg = ColorRect.new()
	bg.color = Color(0.04, 0.03, 0.05, 1.0)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scene_root.add_child(bg)

	# Warning stripes top border
	var stripe = ColorRect.new()
	stripe.color = Color(0.9, 0.55, 0.05, 0.9)
	stripe.position = Vector2(0, 0)
	stripe.size = Vector2(1280, 6)
	scene_root.add_child(stripe)

	# HEADER
	var hdr = _panel(Vector2(0, 6), Vector2(1280, 62), Color(0.07, 0.05, 0.09, 0.97))
	scene_root.add_child(hdr)

	var title = Label.new()
	title.text = "🔧  EMERGENCY FLEET RECOVERY  &  BREAKDOWN SERVICES"
	title.add_theme_font_size_override("font_size", 19)
	title.add_theme_color_override("font_color", Color(1.0, 0.6, 0.1, 1.0))
	title.position = Vector2(20, 18)
	hdr.add_child(title)

	var back_btn = _btn("◀  MAP", Vector2(1170, 12), Vector2(90, 40))
	back_btn.pressed.connect(_go_back)
	hdr.add_child(back_btn)

	var refresh_btn = _btn("↻  REFRESH", Vector2(1058, 12), Vector2(102, 40))
	refresh_btn.add_theme_color_override("font_color", Color(0.6, 0.9, 1.0, 1.0))
	refresh_btn.pressed.connect(_fetch_fleet_status)
	hdr.add_child(refresh_btn)

	# ALERT STRIP
	var alert_strip = _panel(Vector2(0, 68), Vector2(1280, 42), Color(0.12, 0.06, 0.02, 0.9))
	scene_root.add_child(alert_strip)

	var alert_lbl = Label.new()
	alert_lbl.text = "⚠  ROADSIDE REPAIR = +50% COST PREMIUM (emergency call-out surcharge)   |   GARAGE TOW = STANDARD RATES + TOW FEE   |   ACTIVE ROUTES ARE CANCELED ON TOW"
	alert_lbl.add_theme_font_size_override("font_size", 11)
	alert_lbl.add_theme_color_override("font_color", Color(1.0, 0.65, 0.1, 0.85))
	alert_lbl.position = Vector2(16, 13)
	alert_strip.add_child(alert_lbl)

	# FLEET TABLE (left 2/3)
	var fleet_panel = _panel(Vector2(10, 118), Vector2(820, 552), Color(0.06, 0.05, 0.08, 0.9))
	fleet_panel.name = "FleetPanel"
	scene_root.add_child(fleet_panel)

	var fleet_title = Label.new()
	fleet_title.text = "🚛  FLEET HEALTH MONITOR"
	fleet_title.add_theme_font_size_override("font_size", 14)
	fleet_title.add_theme_color_override("font_color", Color(0.85, 0.65, 1.0, 1.0))
	fleet_title.position = Vector2(14, 10)
	fleet_panel.add_child(fleet_title)

	# Column headers
	var col_names = ["TRUCK", "ENGINE", "TIRES", "STATUS", "RISK", "REPAIR EST."]
	var col_x =     [14,       190,     310,     420,      540,    660]
	for i in range(col_names.size()):
		var ch = Label.new()
		ch.text = col_names[i]
		ch.add_theme_font_size_override("font_size", 10)
		ch.add_theme_color_override("font_color", Color(0.38, 0.35, 0.48, 1.0))
		ch.position = Vector2(col_x[i], 36)
		fleet_panel.add_child(ch)

	var col_div = ColorRect.new()
	col_div.color = Color(0.2, 0.15, 0.3, 0.5)
	col_div.position = Vector2(14, 52)
	col_div.size = Vector2(792, 1)
	fleet_panel.add_child(col_div)

	var scroll = ScrollContainer.new()
	scroll.position = Vector2(8, 58)
	scroll.size = Vector2(804, 486)
	scroll.name = "FleetScroll"
	fleet_panel.add_child(scroll)

	var fleet_list = VBoxContainer.new()
	fleet_list.name = "FleetList"
	fleet_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(fleet_list)

	# RIGHT PANEL — action panel
	var action_panel = _panel(Vector2(838, 118), Vector2(432, 552), Color(0.06, 0.05, 0.08, 0.9))
	action_panel.name = "ActionPanel"
	scene_root.add_child(action_panel)
	_render_action_placeholder()

	# BOTTOM STATUS
	var status_bar = _panel(Vector2(0, 678), Vector2(1280, 42), Color(0.05, 0.04, 0.07, 0.97))
	scene_root.add_child(status_bar)
	var sl = Label.new()
	sl.text = "💵 Legal: $%.0f  |  Select a truck from the fleet monitor to view repair options." % GameState.legal_balance
	sl.add_theme_font_size_override("font_size", 11)
	sl.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55, 1.0))
	sl.position = Vector2(16, 13)
	sl.name = "StatusLbl"
	status_bar.add_child(sl)

# ====================================================
# DATA FETCH
# ====================================================
func _fetch_fleet_status() -> void:
	var token = GameState.auth_token
	fleet_http.request(
		BASE_URL + "/api/breakdown/fleet-status",
		["Authorization: Bearer " + token],
		HTTPClient.METHOD_GET
	)
	fleet_http.request_completed.connect(_on_fleet_response, CONNECT_ONE_SHOT)

func _on_fleet_response(_r, code, _h, body) -> void:
	if code != 200:
		_show_toast("Failed to load fleet data (code %d)" % code, Color(1.0, 0.4, 0.3, 1.0))
		return
	var d = JSON.parse_string(body.get_string_from_utf8())
	if not d or not d.has("trucks"):
		return
	fleet_data = d.trucks
	_render_fleet_table()

# ====================================================
# FLEET TABLE RENDERING
# ====================================================
func _render_fleet_table() -> void:
	var list = _find(scene_root, "FleetList")
	if not list:
		return
	for c in list.get_children():
		c.queue_free()

	if fleet_data.is_empty():
		var empty = Label.new()
		empty.text = "No trucks in your fleet. Buy trucks from the Auction House."
		empty.add_theme_font_size_override("font_size", 14)
		empty.add_theme_color_override("font_color", Color(0.35, 0.3, 0.45, 1.0))
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.custom_minimum_size = Vector2(800, 60)
		list.add_child(empty)
		return

	for truck in fleet_data:
		var row = _make_fleet_row(truck)
		list.add_child(row)

func _make_fleet_row(truck: Dictionary) -> Control:
	var engine = truck.get("engineHealth", 0)
	var tires = truck.get("tireWear", 0)
	var impounded = truck.get("isImpounded", false)
	var on_road = truck.get("progressPct", null) != null
	var risk = truck.get("breakdownRisk", "UNKNOWN")
	var repair_est = truck.get("estimatedRepairCost", 0)
	var is_selected = selected_truck.get("truckId", "") == truck.get("truckId", "")

	var row = PanelContainer.new()
	row.custom_minimum_size = Vector2(800, 56)

	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.11, 0.09, 0.15, 0.9) if is_selected else Color(0.08, 0.07, 0.11, 0.85)
	style.border_color = _risk_color(risk) if truck.get("criticalAlert", false) else Color(0.2, 0.15, 0.3, 0.4)
	style.border_width_left = 4 if truck.get("criticalAlert", false) else 1
	style.border_width_bottom = 1
	style.set_corner_radius_all(3)
	row.add_theme_stylebox_override("panel", style)

	# Model + VIN
	var model_lbl = Label.new()
	model_lbl.text = truck.get("model", "?") + "\n" + truck.get("vin", "")[:8] + "..."
	model_lbl.add_theme_font_size_override("font_size", 11)
	model_lbl.add_theme_color_override("font_color", Color(0.85, 0.8, 0.95, 1.0))
	model_lbl.position = Vector2(8, 8)
	model_lbl.size = Vector2(172, 40)
	model_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(model_lbl)

	# Engine bar
	_add_mini_bar(row, engine, Vector2(188, 12), Vector2(110, 10), Color(0.2, 0.85, 0.45, 1.0))
	var eng_lbl = Label.new()
	eng_lbl.text = "%d%%" % engine
	eng_lbl.add_theme_font_size_override("font_size", 10)
	eng_lbl.add_theme_color_override("font_color", _health_color(engine))
	eng_lbl.position = Vector2(304, 10)
	row.add_child(eng_lbl)

	# Tire bar
	_add_mini_bar(row, tires, Vector2(188, 30), Vector2(110, 10), Color(0.2, 0.7, 1.0, 1.0))
	var tire_lbl = Label.new()
	tire_lbl.text = "%d%%" % tires
	tire_lbl.add_theme_font_size_override("font_size", 10)
	tire_lbl.add_theme_color_override("font_color", _health_color(tires))
	tire_lbl.position = Vector2(304, 28)
	row.add_child(tire_lbl)

	# Status badge
	var status_lbl = Label.new()
	var status_txt = ""
	var status_col = Color.WHITE
	if impounded:
		status_txt = "🚫 IMPOUNDED"
		status_col = Color(1.0, 0.3, 0.3, 1.0)
	elif on_road:
		status_txt = "🛣 ON ROAD\n%.0f%%" % truck.get("progressPct", 0)
		status_col = Color(0.3, 0.85, 1.0, 1.0)
	else:
		status_txt = "🏭 IN GARAGE"
		status_col = Color(0.5, 0.5, 0.6, 1.0)
	status_lbl.text = status_txt
	status_lbl.add_theme_font_size_override("font_size", 10)
	status_lbl.add_theme_color_override("font_color", status_col)
	status_lbl.position = Vector2(418, 8)
	status_lbl.size = Vector2(110, 40)
	row.add_child(status_lbl)

	# Risk badge
	var risk_lbl = Label.new()
	risk_lbl.text = risk
	risk_lbl.add_theme_font_size_override("font_size", 11)
	risk_lbl.add_theme_color_override("font_color", _risk_color(risk))
	risk_lbl.position = Vector2(538, 18)
	risk_lbl.size = Vector2(110, 22)
	row.add_child(risk_lbl)

	# Repair estimate
	var est_lbl = Label.new()
	est_lbl.text = "$%s" % _fmt(repair_est)
	est_lbl.add_theme_font_size_override("font_size", 12)
	est_lbl.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2, 1.0))
	est_lbl.position = Vector2(660, 18)
	est_lbl.size = Vector2(100, 22)
	row.add_child(est_lbl)

	# Select button
	var sel_btn = Button.new()
	sel_btn.text = "▶ SELECT"
	sel_btn.position = Vector2(724, 10)
	sel_btn.size = Vector2(72, 36)
	sel_btn.add_theme_font_size_override("font_size", 10)
	sel_btn.add_theme_color_override("font_color", Color(0.75, 0.6, 1.0, 1.0))
	sel_btn.pressed.connect(func(): _select_truck(truck))
	row.add_child(sel_btn)

	return row

func _add_mini_bar(parent: Control, pct: int, pos: Vector2, sz: Vector2, color: Color) -> void:
	var bg = ColorRect.new()
	bg.color = Color(0.1, 0.1, 0.15, 0.9)
	bg.position = pos
	bg.size = sz
	parent.add_child(bg)

	var fill = ColorRect.new()
	fill.color = Color(1.0, 0.2, 0.2, 1.0) if pct < 20 else (Color(0.95, 0.6, 0.1, 1.0) if pct < 50 else color)
	fill.position = pos
	fill.size = Vector2(sz.x * clamp(float(pct) / 100.0, 0.0, 1.0), sz.y)
	parent.add_child(fill)

# ====================================================
# TRUCK SELECTION & ACTION PANEL
# ====================================================
func _select_truck(truck: Dictionary) -> void:
	selected_truck = truck
	_render_fleet_table()
	_render_action_panel(truck)

func _render_action_placeholder() -> void:
	var p = _find(scene_root, "ActionPanel")
	if not p: return
	for c in p.get_children(): c.queue_free()
	var lbl = Label.new()
	lbl.text = "◀  SELECT A TRUCK\nTO VIEW REPAIR\nOPTIONS"
	lbl.add_theme_font_size_override("font_size", 16)
	lbl.add_theme_color_override("font_color", Color(0.3, 0.25, 0.4, 1.0))
	lbl.position = Vector2(80, 190)
	lbl.size = Vector2(272, 120)
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(lbl)

func _render_action_panel(truck: Dictionary) -> void:
	var p = _find(scene_root, "ActionPanel")
	if not p: return
	for c in p.get_children(): c.queue_free()

	var engine = truck.get("engineHealth", 0)
	var tires = truck.get("tireWear", 0)
	var impounded = truck.get("isImpounded", false)
	var risk = truck.get("breakdownRisk", "?")
	var total_est = truck.get("estimatedRepairCost", 0)

	# Title
	var title = Label.new()
	title.text = truck.get("model", "?")
	title.add_theme_font_size_override("font_size", 17)
	title.add_theme_color_override("font_color", Color(0.85, 0.7, 1.0, 1.0))
	title.position = Vector2(14, 12)
	p.add_child(title)

	var vin = Label.new()
	vin.text = "VIN " + truck.get("vin", "—")[:12] + "   |   " + truck.get("currentCity", "?")
	vin.add_theme_font_size_override("font_size", 10)
	vin.add_theme_color_override("font_color", Color(0.4, 0.38, 0.5, 1.0))
	vin.position = Vector2(14, 34)
	p.add_child(vin)

	var div0 = ColorRect.new()
	div0.color = Color(0.25, 0.18, 0.38, 0.5)
	div0.position = Vector2(14, 52)
	div0.size = Vector2(404, 1)
	p.add_child(div0)

	# Health summary
	var y = 62
	for stat in [["ENGINE", engine, Color(0.2, 0.85, 0.45, 1.0)], ["TIRES", tires, Color(0.2, 0.7, 1.0, 1.0)]]:
		var sl = Label.new()
		sl.text = stat[0] + ":  %d%%" % stat[1]
		sl.add_theme_font_size_override("font_size", 13)
		sl.add_theme_color_override("font_color", _health_color(int(stat[1])))
		sl.position = Vector2(14, y)
		p.add_child(sl)

		var bar_bg = ColorRect.new()
		bar_bg.color = Color(0.1, 0.1, 0.15, 1.0)
		bar_bg.position = Vector2(130, y + 4)
		bar_bg.size = Vector2(288, 12)
		p.add_child(bar_bg)

		var bar_fill = ColorRect.new()
		var pct = clamp(float(stat[1]) / 100.0, 0.0, 1.0)
		bar_fill.color = (Color(1.0, 0.2, 0.2, 1.0) if pct < 0.2 else
			(Color(0.95, 0.6, 0.1, 1.0) if pct < 0.5 else stat[2]))
		bar_fill.position = Vector2(130, y + 4)
		bar_fill.size = Vector2(288 * pct, 12)
		p.add_child(bar_fill)
		y += 28

	var risk_lbl = Label.new()
	risk_lbl.text = "BREAKDOWN RISK:  " + risk
	risk_lbl.add_theme_font_size_override("font_size", 12)
	risk_lbl.add_theme_color_override("font_color", _risk_color(risk))
	risk_lbl.position = Vector2(14, y + 4)
	p.add_child(risk_lbl)

	var div1 = ColorRect.new()
	div1.color = Color(0.25, 0.18, 0.38, 0.5)
	div1.position = Vector2(14, y + 26)
	div1.size = Vector2(404, 1)
	p.add_child(div1)

	y += 36

	if impounded:
		# IMPOUND RELEASE SECTION
		var imp_lbl = Label.new()
		imp_lbl.text = "🚫  TRUCK IMPOUNDED"
		imp_lbl.add_theme_font_size_override("font_size", 15)
		imp_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
		imp_lbl.position = Vector2(14, y)
		p.add_child(imp_lbl)

		var rel_lbl = Label.new()
		rel_lbl.text = "Release date: " + str(truck.get("impoundReleaseAt", "unknown"))
		rel_lbl.add_theme_font_size_override("font_size", 11)
		rel_lbl.add_theme_color_override("font_color", Color(0.6, 0.5, 0.6, 0.9))
		rel_lbl.position = Vector2(14, y + 22)
		rel_lbl.size = Vector2(404, 30)
		rel_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		p.add_child(rel_lbl)

		var rel_btn = Button.new()
		rel_btn.text = "💰  PAY EARLY RELEASE FEE\n(2× daily rate per remaining day)"
		rel_btn.position = Vector2(14, y + 60)
		rel_btn.size = Vector2(404, 52)
		rel_btn.add_theme_font_size_override("font_size", 13)
		rel_btn.add_theme_color_override("font_color", Color(1.0, 0.7, 0.2, 1.0))
		rel_btn.pressed.connect(func(): _do_action("release", truck.get("truckId", ""), {}))
		p.add_child(rel_btn)
	else:
		# REPAIR OPTIONS
		var rep_title = Label.new()
		rep_title.text = "ESTIMATED REPAIR: $%s" % _fmt(total_est)
		rep_title.add_theme_font_size_override("font_size", 14)
		rep_title.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2, 1.0))
		rep_title.position = Vector2(14, y)
		p.add_child(rep_title)

		y += 28

		# Checkboxes for engine/tire repair selection
		var eng_check = CheckButton.new()
		eng_check.text = "Repair Engine  (restores to 100%)"
		eng_check.button_pressed = true
		eng_check.position = Vector2(14, y)
		eng_check.name = "EngineCheck"
		eng_check.add_theme_font_size_override("font_size", 12)
		p.add_child(eng_check)

		var tire_check = CheckButton.new()
		tire_check.text = "Repair Tires  (restores to 100%)"
		tire_check.button_pressed = true
		tire_check.position = Vector2(14, y + 30)
		tire_check.name = "TireCheck"
		tire_check.add_theme_font_size_override("font_size", 12)
		p.add_child(tire_check)

		y += 70

		# ROADSIDE REPAIR BUTTON
		var road_btn = Button.new()
		road_btn.text = "🛣  ROADSIDE REPAIR\n+50% Emergency Surcharge — Truck stays on route"
		road_btn.position = Vector2(14, y)
		road_btn.size = Vector2(404, 56)
		road_btn.add_theme_font_size_override("font_size", 13)
		road_btn.add_theme_color_override("font_color", Color(1.0, 0.65, 0.1, 1.0))
		road_btn.pressed.connect(func(): _do_repair("roadside", truck))
		p.add_child(road_btn)

		y += 64

		# GARAGE TOW BUTTON
		var garage_btn = Button.new()
		garage_btn.text = "🏭  TOW TO GARAGE\nStandard rates — Route CANCELED, cargo may be lost"
		garage_btn.position = Vector2(14, y)
		garage_btn.size = Vector2(404, 56)
		garage_btn.add_theme_font_size_override("font_size", 13)
		garage_btn.add_theme_color_override("font_color", Color(0.4, 0.8, 1.0, 1.0))
		garage_btn.pressed.connect(func(): _do_repair("garage", truck))
		p.add_child(garage_btn)

		y += 64

		# Warning for active route
		if truck.get("progressPct", null) != null:
			var warn = Label.new()
			warn.text = "⚠ This truck is on an active route (%.0f%% complete). Garage tow will cancel the route and may jettison contraband." % truck.get("progressPct", 0)
			warn.add_theme_font_size_override("font_size", 10)
			warn.add_theme_color_override("font_color", Color(1.0, 0.55, 0.2, 0.9))
			warn.position = Vector2(14, y)
			warn.size = Vector2(404, 52)
			warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			p.add_child(warn)

# ====================================================
# REPAIR ACTIONS
# ====================================================
func _do_repair(repair_type: String, truck: Dictionary) -> void:
	var eng_check = _find(scene_root, "EngineCheck")
	var tire_check = _find(scene_root, "TireCheck")
	var repair_engine = eng_check.button_pressed if eng_check else true
	var repair_tires = tire_check.button_pressed if tire_check else true

	var endpoint = "/api/breakdown/roadside-repair" if repair_type == "roadside" else "/api/breakdown/garage-repair"
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({
		"truckId": truck.get("truckId", ""),
		"repairEngine": repair_engine,
		"repairTires": repair_tires,
	})
	pending_action = repair_type
	action_http.request(BASE_URL + endpoint, headers, HTTPClient.METHOD_POST, body)
	action_http.request_completed.connect(_on_action_response, CONNECT_ONE_SHOT)
	_show_toast("🔧 Requesting %s repair..." % repair_type, Color(1.0, 0.75, 0.2, 1.0))

func _do_action(action_type: String, truck_id: String, _extra: Dictionary) -> void:
	var endpoint = "/api/breakdown/release-impound/" + truck_id
	var token = GameState.auth_token
	pending_action = action_type
	action_http.request(BASE_URL + endpoint, ["Authorization: Bearer " + token], HTTPClient.METHOD_POST)
	action_http.request_completed.connect(_on_action_response, CONNECT_ONE_SHOT)
	_show_toast("💰 Processing impound release...", Color(1.0, 0.75, 0.2, 1.0))

func _on_action_response(_r, code, _h, body) -> void:
	var d = JSON.parse_string(body.get_string_from_utf8())
	if code == 200 and d:
		var msg = ""
		match pending_action:
			"roadside":
				GameState.update_balances(-float(d.get("totalCharge", 0)), 0.0)
				msg = "✔ Roadside repair complete! Cost: $%s" % _fmt(int(d.get("totalCharge", 0)))
				_show_toast(msg, Color(0.2, 1.0, 0.5, 1.0))
			"garage":
				GameState.update_balances(-float(d.get("totalCharge", 0)), 0.0)
				msg = "✔ Garage repair complete! Cost: $%s" % _fmt(int(d.get("totalCharge", 0)))
				if d.get("contrabandJettisoned", false):
					msg += "  ⚠ Contraband jettisoned by driver."
				_show_toast(msg, Color(0.3, 0.85, 1.0, 1.0))
			"release":
				var fee = d.get("fee", 0)
				if fee > 0:
					GameState.update_balances(-float(fee), 0.0)
				_show_toast("✔ Truck released from impound! Fee paid: $%s" % _fmt(int(fee)), Color(0.9, 0.7, 0.2, 1.0))
		# Refresh fleet after action
		selected_truck = {}
		_fetch_fleet_status()
	else:
		var err = d.get("error", "UNKNOWN") if d else "PARSE_ERROR"
		_show_toast("✕ Failed: " + err, Color(1.0, 0.3, 0.3, 1.0))

# ====================================================
# HELPERS
# ====================================================
func _go_back() -> void:
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _health_color(pct: int) -> Color:
	if pct < 20: return Color(1.0, 0.2, 0.2, 1.0)
	if pct < 50: return Color(1.0, 0.65, 0.1, 1.0)
	return Color(0.3, 0.95, 0.5, 1.0)

func _risk_color(risk: String) -> Color:
	match risk:
		"CATASTROPHIC": return Color(1.0, 0.1, 0.1, 1.0)
		"SEVERE":       return Color(1.0, 0.4, 0.1, 1.0)
		"MODERATE":     return Color(1.0, 0.75, 0.1, 1.0)
		"MINOR":        return Color(0.4, 0.9, 0.4, 1.0)
	return Color(0.5, 0.5, 0.6, 1.0)

func _show_toast(msg: String, color: Color = Color(1.0, 0.8, 0.2, 1.0)) -> void:
	var t = Label.new()
	t.text = msg
	t.add_theme_font_size_override("font_size", 13)
	t.add_theme_color_override("font_color", color)
	t.position = Vector2(80, 642)
	t.size = Vector2(1120, 28)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	scene_root.add_child(t)
	var tw = create_tween()
	tw.tween_interval(3.0)
	tw.tween_property(t, "modulate:a", 0.0, 1.0)
	tw.tween_callback(t.queue_free)

func _panel(pos: Vector2, sz: Vector2, col: Color) -> PanelContainer:
	var p = PanelContainer.new()
	p.position = pos; p.size = sz
	var s = StyleBoxFlat.new()
	s.bg_color = col
	s.border_color = Color(0.22, 0.15, 0.32, 0.55)
	s.border_width_bottom = 1; s.border_width_top = 1
	s.border_width_left = 1; s.border_width_right = 1
	s.set_corner_radius_all(5)
	p.add_theme_stylebox_override("panel", s)
	return p

func _btn(txt: String, pos: Vector2, sz: Vector2) -> Button:
	var b = Button.new()
	b.text = txt; b.position = pos; b.size = sz
	b.add_theme_font_size_override("font_size", 11)
	b.add_theme_color_override("font_color", Color(0.75, 0.65, 0.9, 1.0))
	return b

func _fmt(n: int) -> String:
	if n >= 1000000: return "%.1fM" % (float(n) / 1000000.0)
	if n >= 1000: return "%.1fK" % (float(n) / 1000.0)
	return str(n)

func _find(root: Node, name: String) -> Node:
	if root.name == name: return root
	for c in root.get_children():
		var r = _find(c, name)
		if r: return r
	return null

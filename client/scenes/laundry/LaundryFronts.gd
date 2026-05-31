extends Control

# ==========================================
# MONEY LAUNDERING FRONT BUSINESSES
# Buy legal fronts (Taxi, Cafe, Logistics HQ),
# run laundry cycles, upgrade throughput,
# monitor police raid risk in real time.
# ==========================================

@onready var back_btn: Button = %BackBtn
@onready var player_lbl: Label = %PlayerLabel
@onready var balance_lbl: Label = %BalanceLabel
@onready var dirty_lbl: Label = %DirtyLabel
@onready var heat_lbl: Label = %HeatLabel
@onready var fronts_list: VBoxContainer = %FrontsList
@onready var buy_panel: PanelContainer = %BuyPanel
@onready var launder_panel: PanelContainer = %LaunderPanel
@onready var launder_front_lbl: Label = %LaunderFrontLabel
@onready var launder_rate_lbl: Label = %LaunderRateLabel
@onready var launder_risk_lbl: Label = %LaunderRiskLabel
@onready var launder_input: LineEdit = %LaunderInput
@onready var launder_btn: Button = %LaunderBtn
@onready var result_panel: PanelContainer = %ResultPanel
@onready var result_lbl: Label = %ResultLabel
@onready var console_lbl: Label = %ConsoleLabel

var api_base: String = "http://127.0.0.1:3000/api"
var fronts_data: Array = []
var selected_front: Dictionary = {}

# Front type catalog for purchase panel
const FRONT_CATALOG = [
	{
		"type": "TAXI",
		"name": "Transit Taxi Co.",
		"cost": 15000,
		"rate": 500,
		"yield_pct": 80,
		"icon": "🚕",
		"desc": "Low-profile. Processes $500/cycle at 80% conversion yield. Minimal heat risk."
	},
	{
		"type": "CAFE",
		"name": "Truck Stop Café",
		"cost": 35000,
		"rate": 1500,
		"yield_pct": 83,
		"icon": "☕",
		"desc": "Mid-tier front. Processes $1,500/cycle at 83% yield. Moderate throughput."
	},
	{
		"type": "LOGISTICS",
		"name": "Legal Freight Ltd.",
		"cost": 80000,
		"rate": 4500,
		"yield_pct": 86,
		"icon": "🏢",
		"desc": "Premium cover corp. Processes $4,500/cycle at 86% yield. High police scrutiny."
	},
]

func _ready() -> void:
	_apply_theme()
	player_lbl.text = GameState.username.to_upper()
	_refresh_header()

	GameState.balance_updated.connect(_on_balances_updated)
	GameState.reputation_updated.connect(_on_reputation_updated)

	back_btn.pressed.connect(_on_back)
	launder_btn.pressed.connect(_on_launder)

	buy_panel.hide()
	launder_panel.hide()
	result_panel.hide()

	_fetch_fronts()

# ==========================================
# API
# ==========================================
func _fetch_fronts() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_fronts_response.bind(http))
	http.request(
		api_base + "/laundry",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _buy_front(type: String) -> void:
	_log("Acquiring front business...", Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_buy_response.bind(http))
	http.request(
		api_base + "/laundry/buy",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		JSON.stringify({"type": type})
	)

func _run_launder(front_id: String, amount: float) -> void:
	_log("Initiating laundry cycle...", Color(0.925, 0.607, 0.141))
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_launder_response.bind(http))
	http.request(
		api_base + "/laundry/" + front_id + "/launder",
		["Authorization: Bearer " + NetworkManager.jwt_token, "Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		JSON.stringify({"amount": amount})
	)

# ==========================================
# RESPONSE HANDLERS
# ==========================================
func _on_fronts_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Array:
			fronts_data = data
			_render_fronts()
			_log("%d front business(es) operational." % fronts_data.size(), Color(0.18, 0.803, 0.443))
	else:
		_log("Failed to load fronts (HTTP %d)." % code, Color(0.901, 0.298, 0.235))

func _on_buy_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if code == 201:
		_log("Front acquired: " + data.get("front", {}).get("name", "?"), Color(0.18, 0.803, 0.443))
		buy_panel.hide()
		_fetch_fronts()
	else:
		_log("Purchase failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

func _on_launder_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest) -> void:
	http.queue_free()
	var data = JSON.parse_string(body.get_string_from_utf8())
	if code == 200:
		if data.get("raided", false):
			# RAID scenario
			result_panel.show()
			result_lbl.text = "🚨 POLICE RAID!\n\nOfficers stormed \"%s\".\nDirty batch SEIZED.\nBusiness locked 24h.\n\nHeat +20 ⬆" % selected_front.get("name", "?")
			result_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
			_log("RAID! Business locked. Heat spiked.", Color(0.901, 0.298, 0.235))
			GameState.police_heat = min(GameState.police_heat + 20, 100)
		else:
			var dirty_in = float(data.get("dirtyProcessed", 0))
			var clean_out = float(data.get("cleanCredited", 0))
			var yield_pct = int(float(data.get("cleanCredited", 0)) / float(data.get("dirtyProcessed", 1)) * 100)
			result_panel.show()
			result_lbl.text = "✓ LAUNDRY CYCLE COMPLETE\n\nDirty Input:  $%.0f\nClean Output: $%.0f\nConversion:   %d%%\n\nRisk Roll: %.0f%% (Threshold: %.0f%%)" % [
				dirty_in, clean_out, yield_pct,
				float(data.get("roll", 0)), float(data.get("risk", 0))
			]
			result_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))
			GameState.update_balances(clean_out, -dirty_in)
			_log("Cycle complete. $%.0f cleaned." % clean_out, Color(0.18, 0.803, 0.443))
		launder_panel.hide()
		_fetch_fronts()
	else:
		_log("Launder failed: " + data.get("message", "Error"), Color(0.901, 0.298, 0.235))

# ==========================================
# RENDERING
# ==========================================
func _render_fronts() -> void:
	for child in fronts_list.get_children():
		child.queue_free()

	# Header: buy new front button row
	var buy_row = HBoxContainer.new()
	buy_row.add_theme_constant_override("separation", 8)

	var buy_title = Label.new()
	buy_title.text = "ACTIVE FRONTS"
	buy_title.add_theme_font_size_override("font_size", 13)
	buy_title.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.7))
	buy_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buy_row.add_child(buy_title)

	var new_btn = Button.new()
	new_btn.text = "+ ACQUIRE FRONT"
	new_btn.add_theme_font_size_override("font_size", 11)
	new_btn.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	var style_new = StyleBoxFlat.new()
	style_new.bg_color = Color(0.925, 0.607, 0.141, 0.07)
	style_new.border_color = Color(0.925, 0.607, 0.141, 0.35)
	style_new.border_width_bottom = 1
	style_new.set_corner_radius_all(4)
	new_btn.add_theme_stylebox_override("normal", style_new)
	new_btn.pressed.connect(_open_buy_panel)
	buy_row.add_child(new_btn)
	fronts_list.add_child(buy_row)

	if fronts_data.is_empty():
		var hint = Label.new()
		hint.text = "No fronts owned. Acquire a business to start laundering dirty proceeds."
		hint.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.4))
		hint.add_theme_font_size_override("font_size", 12)
		hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		fronts_list.add_child(hint)
		return

	for front in fronts_data:
		var card = _build_front_card(front)
		fronts_list.add_child(card)

func _build_front_card(front: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	var is_raided = front.get("isRaided", false)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.063, 0.078, 1.0)
	style.border_color = Color(0.901, 0.298, 0.235, 0.5) if is_raided else Color(0.607, 0.349, 0.713, 0.35)
	style.border_width_left = 3
	style.set_corner_radius_all(6)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", style)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	panel.add_child(vbox)

	# Header row
	var header = HBoxContainer.new()
	var name_lbl = Label.new()
	name_lbl.text = front.get("name", "Unknown Front")
	name_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235) if is_raided else Color(1, 1, 1))
	name_lbl.add_theme_font_size_override("font_size", 15)
	header.add_child(name_lbl)

	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(spacer)

	var status_lbl = Label.new()
	if is_raided:
		status_lbl.text = "🚨 RAIDED — LOCKED"
		status_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	else:
		status_lbl.text = "✓ OPERATIONAL"
		status_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))
	status_lbl.add_theme_font_size_override("font_size", 11)
	header.add_child(status_lbl)
	vbox.add_child(header)

	# City + upgrade level
	var meta_lbl = Label.new()
	meta_lbl.text = "City: %s  |  Upgrade Level: %d  |  Rate cap: $%s/cycle" % [
		front.get("city", "?"),
		int(front.get("upgradeLevel", 1)),
		_format_cash(float(front.get("laundryRate", 0)))
	]
	meta_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.65))
	meta_lbl.add_theme_font_size_override("font_size", 11)
	vbox.add_child(meta_lbl)

	# Yield rate bar
	var yield_pct = int(float(front.get("lossMultiplier", 0.8)) * 100)
	var yield_row = HBoxContainer.new()
	yield_row.add_theme_constant_override("separation", 8)
	var yield_lbl = Label.new()
	yield_lbl.text = "YIELD"
	yield_lbl.custom_minimum_size.x = 52
	yield_lbl.add_theme_font_size_override("font_size", 10)
	yield_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	yield_row.add_child(yield_lbl)
	var bar_bg = PanelContainer.new()
	bar_bg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar_bg.custom_minimum_size.y = 7
	var sbg = StyleBoxFlat.new()
	sbg.bg_color = Color(0.1, 0.1, 0.1)
	sbg.set_corner_radius_all(3)
	bar_bg.add_theme_stylebox_override("panel", sbg)
	var bar_fill = PanelContainer.new()
	bar_fill.anchor_right = float(yield_pct) / 100.0
	var sfill = StyleBoxFlat.new()
	sfill.bg_color = Color(0.607, 0.349, 0.713)
	sfill.set_corner_radius_all(3)
	bar_fill.add_theme_stylebox_override("panel", sfill)
	bar_bg.add_child(bar_fill)
	yield_row.add_child(bar_bg)
	var yield_pct_lbl = Label.new()
	yield_pct_lbl.text = "%d%%" % yield_pct
	yield_pct_lbl.custom_minimum_size.x = 36
	yield_pct_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	yield_pct_lbl.add_theme_font_size_override("font_size", 10)
	yield_pct_lbl.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
	yield_row.add_child(yield_pct_lbl)
	vbox.add_child(yield_row)

	# Raid cooldown info
	if is_raided and front.has("raidCooldown") and front.raidCooldown != null:
		var cd_lbl = Label.new()
		cd_lbl.text = "⏱ Locked until: " + str(front.get("raidCooldown", "?")).left(19).replace("T", " ")
		cd_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235, 0.8))
		cd_lbl.add_theme_font_size_override("font_size", 11)
		vbox.add_child(cd_lbl)

	# Action button
	if not is_raided:
		var btn = Button.new()
		btn.text = "⚗ RUN LAUNDRY CYCLE"
		btn.add_theme_font_size_override("font_size", 12)
		btn.add_theme_color_override("font_color", Color(0.607, 0.349, 0.713))
		var style_btn = StyleBoxFlat.new()
		style_btn.bg_color = Color(0.607, 0.349, 0.713, 0.08)
		style_btn.border_color = Color(0.607, 0.349, 0.713, 0.35)
		style_btn.border_width_bottom = 1
		style_btn.set_corner_radius_all(4)
		btn.add_theme_stylebox_override("normal", style_btn)
		btn.pressed.connect(_open_launder_panel.bind(front))
		vbox.add_child(btn)

	return panel

# ==========================================
# BUY PANEL
# ==========================================
func _open_buy_panel() -> void:
	result_panel.hide()
	launder_panel.hide()

	# Clear old buy panel children and rebuild
	for child in buy_panel.get_children():
		child.queue_free()

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	buy_panel.add_child(vbox)

	var title = Label.new()
	title.text = "ACQUIRE FRONT BUSINESS"
	title.add_theme_font_size_override("font_size", 15)
	title.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	vbox.add_child(title)

	var sep = HSeparator.new()
	vbox.add_child(sep)

	for item in FRONT_CATALOG:
		var card = _build_buy_option(item)
		vbox.add_child(card)

	var close_btn = Button.new()
	close_btn.text = "✕ CANCEL"
	close_btn.add_theme_font_size_override("font_size", 11)
	close_btn.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.5))
	close_btn.pressed.connect(buy_panel.hide)
	vbox.add_child(close_btn)

	buy_panel.show()

func _build_buy_option(item: Dictionary) -> PanelContainer:
	var panel = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.06, 0.07, 0.09, 1)
	style.border_color = Color(0.925, 0.607, 0.141, 0.2)
	style.border_width_left = 2
	style.set_corner_radius_all(5)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	panel.add_theme_stylebox_override("panel", style)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 4)
	panel.add_child(vbox)

	var h = HBoxContainer.new()
	var icon_lbl = Label.new()
	icon_lbl.text = item.icon + "  " + item.name
	icon_lbl.add_theme_font_size_override("font_size", 14)
	icon_lbl.add_theme_color_override("font_color", Color(1, 1, 1))
	h.add_child(icon_lbl)
	var sp = Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(sp)
	var cost_lbl = Label.new()
	cost_lbl.text = "$%s CLEAN" % _format_cash(float(item.cost))
	cost_lbl.add_theme_font_size_override("font_size", 12)
	cost_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))
	h.add_child(cost_lbl)
	vbox.add_child(h)

	var desc_lbl = Label.new()
	desc_lbl.text = item.desc
	desc_lbl.add_theme_font_size_override("font_size", 11)
	desc_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843, 0.65))
	desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(desc_lbl)

	var buy_btn = Button.new()
	buy_btn.text = "💰 BUY — $%s" % _format_cash(float(item.cost))
	buy_btn.add_theme_font_size_override("font_size", 11)
	buy_btn.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	var sb = StyleBoxFlat.new()
	sb.bg_color = Color(0.925, 0.607, 0.141, 0.07)
	sb.border_color = Color(0.925, 0.607, 0.141, 0.3)
	sb.border_width_bottom = 1
	sb.set_corner_radius_all(4)
	buy_btn.add_theme_stylebox_override("normal", sb)
	buy_btn.pressed.connect(_buy_front.bind(item.type))
	vbox.add_child(buy_btn)

	return panel

# ==========================================
# LAUNDER PANEL
# ==========================================
func _open_launder_panel(front: Dictionary) -> void:
	selected_front = front
	buy_panel.hide()
	result_panel.hide()

	var rate = float(front.get("laundryRate", 500))
	var yield_pct = int(float(front.get("lossMultiplier", 0.8)) * 100)
	var dirty = GameState.black_market_balance
	var heat = GameState.police_heat

	# Calculate current risk at max rate for display
	var batch_scale = int(rate / 1000)
	var heat_scale = int(heat / 10)
	var risk_at_max = min(4 + batch_scale + heat_scale, 80)

	launder_front_lbl.text = front.get("name", "?")
	launder_rate_lbl.text = "Cycle cap: $%s  |  Yield: %d%%" % [_format_cash(rate), yield_pct]
	launder_risk_lbl.text = "Raid risk at max: %d%%  |  Your dirty cash: $%s" % [risk_at_max, _format_cash(dirty)]

	if risk_at_max > 50:
		launder_risk_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	elif risk_at_max > 25:
		launder_risk_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	else:
		launder_risk_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))

	launder_input.text = "%.0f" % min(rate, dirty)
	launder_input.placeholder_text = "Amount to launder (max $%.0f)" % rate

	launder_panel.show()

func _on_launder() -> void:
	var input_str = launder_input.text.strip_edges()
	if not input_str.is_valid_float():
		_log("Invalid amount entered.", Color(0.901, 0.298, 0.235))
		return
	var amount = float(input_str)
	if amount <= 0:
		_log("Amount must be greater than zero.", Color(0.901, 0.298, 0.235))
		return
	if amount > GameState.black_market_balance:
		_log("Insufficient dirty cash balance.", Color(0.901, 0.298, 0.235))
		return
	_run_launder(selected_front.get("id", ""), amount)

# ==========================================
# HELPERS
# ==========================================
func _format_cash(amount: float) -> String:
	if amount >= 1000:
		return "%.0f" % amount
	return "%.0f" % amount

func _refresh_header() -> void:
	balance_lbl.text = "$%s CLEAN" % _format_cash(GameState.legal_balance)
	dirty_lbl.text = "$%s DIRTY" % _format_cash(GameState.black_market_balance)
	heat_lbl.text = "HEAT: %d%%" % GameState.police_heat
	if GameState.police_heat > 60:
		heat_lbl.add_theme_color_override("font_color", Color(0.901, 0.298, 0.235))
	elif GameState.police_heat > 30:
		heat_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
	else:
		heat_lbl.add_theme_color_override("font_color", Color(0.18, 0.803, 0.443))

func _on_balances_updated(legal: float, dirty: float) -> void:
	balance_lbl.text = "$%s CLEAN" % _format_cash(legal)
	dirty_lbl.text = "$%s DIRTY" % _format_cash(dirty)

func _on_reputation_updated(score: int, heat: int) -> void:
	heat_lbl.text = "HEAT: %d%%" % heat
	_refresh_header()

func _log(text: String, color: Color) -> void:
	console_lbl.text = text
	console_lbl.add_theme_color_override("font_color", color)

func _on_back() -> void:
	get_tree().change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _apply_theme() -> void:
	pass

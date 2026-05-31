extends Control

# ====================================================
# Leaderboard.gd — Global Competitive Rankings Scene
# Shows 5 ranking categories with live refresh from server
# Fleet Value | Underworld Rep | Total Mileage | Heat Index | Auction Wins
# ====================================================

const BASE_URL = "http://localhost:3000"

var current_tab: String = "underworld-rep"
var leaderboard_data: Dictionary = {}
var my_ranks: Dictionary = {}
var http_active: bool = false

@onready var scene_root = $CanvasLayer
@onready var http = $HTTPRequest
@onready var my_rank_http = $MyRankHTTPRequest

const TABS = [
	{ "id": "underworld-rep",    "label": "🔥  UNDERWORLD REP",   "color": Color(0.8, 0.3, 1.0, 1.0) },
	{ "id": "fleet-value",       "label": "🚛  FLEET VALUE",       "color": Color(0.2, 0.8, 1.0, 1.0) },
	{ "id": "mileage",           "label": "📍  TOTAL MILEAGE",     "color": Color(0.2, 0.9, 0.5, 1.0) },
	{ "id": "heat-index",        "label": "☢  HEAT INDEX",        "color": Color(1.0, 0.3, 0.1, 1.0) },
	{ "id": "auction-wins",      "label": "🔨  AUCTION WINS",      "color": Color(1.0, 0.8, 0.1, 1.0) },
]

func _ready() -> void:
	_build_ui()
	_fetch_my_ranks()
	_fetch_leaderboard(current_tab)

# ====================================================
# BUILD THE FULL UI
# ====================================================
func _build_ui() -> void:
	# Background
	var bg = ColorRect.new()
	bg.color = Color(0.04, 0.04, 0.06, 1.0)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scene_root.add_child(bg)

	# Decorative grid lines
	for i in range(8):
		var line = ColorRect.new()
		line.color = Color(0.08, 0.08, 0.12, 0.4)
		line.position = Vector2(0, 90 * i)
		line.size = Vector2(1280, 1)
		scene_root.add_child(line)

	# HEADER
	var header = _panel(Vector2(0, 0), Vector2(1280, 70), Color(0.06, 0.06, 0.1, 0.95))
	scene_root.add_child(header)

	var title = Label.new()
	title.text = "🏆  GLOBAL LEADERBOARDS — NIGHTHAUL NETWORK"
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2, 1.0))
	title.position = Vector2(20, 20)
	header.add_child(title)

	var back_btn = _button("◀  MAP", Vector2(1170, 16), Vector2(90, 38))
	back_btn.pressed.connect(_go_back)
	header.add_child(back_btn)

	var refresh_btn = _button("↻  REFRESH", Vector2(1060, 16), Vector2(100, 38))
	refresh_btn.pressed.connect(func(): _fetch_leaderboard(current_tab))
	header.add_child(refresh_btn)

	# MY RANK SUMMARY STRIP
	var myrank_panel = _panel(Vector2(0, 70), Vector2(1280, 56), Color(0.07, 0.07, 0.11, 0.95))
	myrank_panel.name = "MyRankPanel"
	scene_root.add_child(myrank_panel)

	var myrank_lbl = Label.new()
	myrank_lbl.text = "Loading your ranks..."
	myrank_lbl.add_theme_font_size_override("font_size", 12)
	myrank_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7, 1.0))
	myrank_lbl.position = Vector2(16, 18)
	myrank_lbl.name = "MyRankLabel"
	myrank_panel.add_child(myrank_lbl)

	# TAB ROW
	var tab_bar = HBoxContainer.new()
	tab_bar.position = Vector2(0, 130)
	tab_bar.size = Vector2(1280, 50)
	tab_bar.name = "TabBar"
	scene_root.add_child(tab_bar)

	for tab in TABS:
		var btn = Button.new()
		btn.text = tab.label
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.custom_minimum_size = Vector2(0, 50)
		btn.add_theme_font_size_override("font_size", 13)

		var tid = tab.id
		var tcolor = tab.color
		btn.pressed.connect(func(): _switch_tab(tid, tcolor))

		if tab.id == current_tab:
			btn.add_theme_color_override("font_color", tab.color)
		else:
			btn.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55, 1.0))

		btn.name = "Tab_" + tab.id.replace("-", "_")
		tab_bar.add_child(btn)

	# COLUMN HEADERS
	var col_header = _panel(Vector2(0, 184), Vector2(1280, 36), Color(0.08, 0.08, 0.12, 0.95))
	col_header.name = "ColHeader"
	scene_root.add_child(col_header)

	var col_labels = ["#", "PLAYER", "SCORE / VALUE", "TIER / STATUS", "FLEET SIZE"]
	var col_x = [12, 80, 440, 660, 940]
	for i in range(col_labels.size()):
		var lbl = Label.new()
		lbl.text = col_labels[i]
		lbl.add_theme_font_size_override("font_size", 11)
		lbl.add_theme_color_override("font_color", Color(0.4, 0.4, 0.55, 1.0))
		lbl.position = Vector2(col_x[i], 10)
		col_header.add_child(lbl)

	# MAIN TABLE SCROLL
	var scroll = ScrollContainer.new()
	scroll.position = Vector2(0, 222)
	scroll.size = Vector2(1280, 438)
	scroll.name = "TableScroll"
	scene_root.add_child(scroll)

	var table = VBoxContainer.new()
	table.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	table.name = "Table"
	scroll.add_child(table)

	# FOOTER
	var footer = _panel(Vector2(0, 664), Vector2(1280, 56), Color(0.05, 0.05, 0.08, 0.95))
	scene_root.add_child(footer)

	var footer_lbl = Label.new()
	footer_lbl.text = "Rankings update live every 60 seconds. Your stats are counted from all-time records."
	footer_lbl.add_theme_font_size_override("font_size", 11)
	footer_lbl.add_theme_color_override("font_color", Color(0.3, 0.3, 0.4, 1.0))
	footer_lbl.position = Vector2(16, 18)
	footer.add_child(footer_lbl)

	# Loading overlay
	var loading = Label.new()
	loading.text = "⏳ Loading..."
	loading.add_theme_font_size_override("font_size", 18)
	loading.add_theme_color_override("font_color", Color(0.6, 0.5, 0.8, 1.0))
	loading.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	loading.name = "LoadingLabel"
	loading.visible = false
	scene_root.add_child(loading)

# ====================================================
# DATA FETCHING
# ====================================================
func _fetch_leaderboard(tab_id: String) -> void:
	if http_active:
		return
	http_active = true
	_set_loading(true)
	current_tab = tab_id

	var token = GameState.auth_token
	var headers = ["Authorization: Bearer " + token]
	http.request(BASE_URL + "/api/leaderboard/" + tab_id, headers, HTTPClient.METHOD_GET)
	http.request_completed.connect(_on_leaderboard_response, CONNECT_ONE_SHOT)

func _on_leaderboard_response(_result, response_code, _headers, body) -> void:
	http_active = false
	_set_loading(false)

	if response_code != 200:
		_show_error("Server error. Check your connection.")
		return

	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not parsed or not parsed.has("leaderboard"):
		_show_error("Invalid server response.")
		return

	var entries = parsed.leaderboard
	var tab_def = TABS.filter(func(t): return t.id == current_tab)
	var tab_color = tab_def[0].color if tab_def.size() > 0 else Color.WHITE

	_render_table(entries, current_tab, tab_color)

func _fetch_my_ranks() -> void:
	var token = GameState.auth_token
	var headers = ["Authorization: Bearer " + token]
	my_rank_http.request(BASE_URL + "/api/leaderboard/my-rank", headers, HTTPClient.METHOD_GET)
	my_rank_http.request_completed.connect(_on_my_rank_response, CONNECT_ONE_SHOT)

func _on_my_rank_response(_result, response_code, _headers, body) -> void:
	if response_code != 200:
		return

	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not parsed or not parsed.has("ranks"):
		return

	my_ranks = parsed
	_render_my_rank_strip(parsed)

# ====================================================
# RENDER MY RANK STRIP
# ====================================================
func _render_my_rank_strip(data: Dictionary) -> void:
	var panel = _find_node(scene_root, "MyRankPanel")
	var lbl = _find_node(scene_root, "MyRankLabel")
	if not lbl:
		return

	var ranks = data.ranks
	var total = data.get("totalPlayers", "?")
	var username = data.get("username", "You")

	lbl.text = (
		"👤 %s   |   🔥 Rep Rank: #%d/%s   |   🚛 Fleet Rank: #%d/%s   |   📍 Mileage Rank: #%d/%s   |   ☢ Heat Rank: #%d/%s" % [
			username,
			ranks.underworldRep.rank, total,
			ranks.fleetValue.rank, total,
			ranks.totalMileage.rank, total,
			ranks.heatIndex.rank, total,
		]
	)
	lbl.add_theme_color_override("font_color", Color(0.8, 0.75, 0.3, 1.0))

# ====================================================
# RENDER TABLE ROWS
# ====================================================
func _render_table(entries: Array, tab_id: String, tab_color: Color) -> void:
	var table = _find_node(scene_root, "Table")
	if not table:
		return
	for child in table.get_children():
		child.queue_free()

	if entries.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "No data yet. Be the first to make your mark."
		empty_lbl.add_theme_font_size_override("font_size", 16)
		empty_lbl.add_theme_color_override("font_color", Color(0.4, 0.4, 0.5, 1.0))
		empty_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_lbl.custom_minimum_size = Vector2(1280, 80)
		table.add_child(empty_lbl)
		return

	for entry in entries:
		var row = _make_row(entry, tab_id, tab_color)
		table.add_child(row)

func _make_row(entry: Dictionary, tab_id: String, tab_color: Color) -> Control:
	var rank = entry.get("rank", 0)
	var username = entry.get("username", "Unknown")
	var is_me = (username == GameState.username)

	# Row background — gold/silver/bronze for top 3, highlight self
	var bg_color = Color(0.07, 0.07, 0.10, 0.85)
	if is_me:
		bg_color = Color(0.1, 0.09, 0.04, 0.9)
	elif rank == 1:
		bg_color = Color(0.14, 0.12, 0.03, 0.9)
	elif rank == 2:
		bg_color = Color(0.10, 0.10, 0.10, 0.85)
	elif rank == 3:
		bg_color = Color(0.10, 0.06, 0.03, 0.85)

	var row = PanelContainer.new()
	row.custom_minimum_size = Vector2(1280, 52)

	var style = StyleBoxFlat.new()
	style.bg_color = bg_color
	if is_me:
		style.border_color = Color(0.9, 0.75, 0.1, 0.7)
		style.border_width_left = 3
	elif rank <= 3:
		style.border_color = _rank_medal_color(rank)
		style.border_width_left = 3
	row.add_theme_stylebox_override("panel", style)

	# Rank number
	var rank_lbl = Label.new()
	rank_lbl.text = _rank_label(rank)
	rank_lbl.add_theme_font_size_override("font_size", 18)
	rank_lbl.add_theme_color_override("font_color", _rank_medal_color(rank))
	rank_lbl.position = Vector2(12, 14)
	rank_lbl.size = Vector2(60, 28)
	rank_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	row.add_child(rank_lbl)

	# Username
	var name_lbl = Label.new()
	name_lbl.text = username + ("  ◀ YOU" if is_me else "")
	name_lbl.add_theme_font_size_override("font_size", 15)
	name_lbl.add_theme_color_override("font_color", Color(0.9, 0.75, 0.2, 1.0) if is_me else Color(0.85, 0.85, 0.9, 1.0))
	name_lbl.position = Vector2(80, 16)
	name_lbl.size = Vector2(350, 28)
	row.add_child(name_lbl)

	# Score / Value column
	var score_text = _format_score(entry, tab_id)
	var score_lbl = Label.new()
	score_lbl.text = score_text
	score_lbl.add_theme_font_size_override("font_size", 14)
	score_lbl.add_theme_color_override("font_color", tab_color)
	score_lbl.position = Vector2(440, 16)
	score_lbl.size = Vector2(210, 28)
	row.add_child(score_lbl)

	# Tier / Status column
	var tier_text = entry.get("tier", entry.get("wantedLevel", ""))
	var tier_lbl = Label.new()
	tier_lbl.text = tier_text
	tier_lbl.add_theme_font_size_override("font_size", 13)
	tier_lbl.add_theme_color_override("font_color", Color(0.75, 0.65, 0.9, 1.0))
	tier_lbl.position = Vector2(660, 16)
	tier_lbl.size = Vector2(270, 28)
	row.add_child(tier_lbl)

	# Fleet size column
	var fleet_val = entry.get("fleetSize", entry.get("truckCount", "—"))
	var fleet_lbl = Label.new()
	fleet_lbl.text = str(fleet_val) + (" trucks" if fleet_val != "—" else "")
	fleet_lbl.add_theme_font_size_override("font_size", 13)
	fleet_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.65, 1.0))
	fleet_lbl.position = Vector2(940, 16)
	fleet_lbl.size = Vector2(200, 28)
	row.add_child(fleet_lbl)

	# Divider
	var div = ColorRect.new()
	div.color = Color(0.12, 0.12, 0.16, 0.6)
	div.position = Vector2(0, 51)
	div.size = Vector2(1280, 1)
	row.add_child(div)

	return row

# ====================================================
# TAB SWITCHING
# ====================================================
func _switch_tab(tab_id: String, tab_color: Color) -> void:
	current_tab = tab_id
	# Update tab button colors
	var tab_bar = _find_node(scene_root, "TabBar")
	if tab_bar:
		for btn in tab_bar.get_children():
			if btn is Button:
				var btn_id = btn.name.replace("Tab_", "").replace("_", "-")
				if btn_id == tab_id:
					btn.add_theme_color_override("font_color", tab_color)
				else:
					btn.add_theme_color_override("font_color", Color(0.45, 0.45, 0.55, 1.0))

	_fetch_leaderboard(tab_id)

# ====================================================
# HELPERS
# ====================================================
func _format_score(entry: Dictionary, tab_id: String) -> String:
	match tab_id:
		"underworld-rep":
			return "⭐ %s REP" % _fmt_num(entry.get("reputationScore", 0))
		"fleet-value":
			return "💰 $%s" % _fmt_num(entry.get("fleetValue", 0))
		"mileage":
			return "📍 %s km" % _fmt_num(int(entry.get("totalMileageKm", 0)))
		"heat-index":
			return "☢ %d HEAT" % entry.get("policeHeat", 0)
		"auction-wins":
			return "🔨 %d wins  ($%s)" % [
				entry.get("auctionWins", 0),
				_fmt_num(int(entry.get("totalSpentLegal", 0)))
			]
	return ""

func _rank_label(rank: int) -> String:
	match rank:
		1: return "🥇"
		2: return "🥈"
		3: return "🥉"
	return "#" + str(rank)

func _rank_medal_color(rank: int) -> Color:
	match rank:
		1: return Color(1.0, 0.84, 0.0, 1.0)  # gold
		2: return Color(0.75, 0.75, 0.75, 1.0)  # silver
		3: return Color(0.8, 0.5, 0.2, 1.0)  # bronze
	return Color(0.5, 0.5, 0.6, 1.0)

func _fmt_num(n: int) -> String:
	if n >= 1000000: return "%.1fM" % (float(n) / 1000000.0)
	if n >= 1000: return "%.1fK" % (float(n) / 1000.0)
	return str(n)

func _set_loading(visible_state: bool) -> void:
	var loading = _find_node(scene_root, "LoadingLabel")
	if loading:
		loading.visible = visible_state

func _show_error(msg: String) -> void:
	var table = _find_node(scene_root, "Table")
	if not table:
		return
	for child in table.get_children():
		child.queue_free()
	var lbl = Label.new()
	lbl.text = "⚠ " + msg
	lbl.add_theme_font_size_override("font_size", 16)
	lbl.add_theme_color_override("font_color", Color(1.0, 0.4, 0.3, 1.0))
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.custom_minimum_size = Vector2(1280, 80)
	table.add_child(lbl)

func _go_back() -> void:
	get_tree().change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _panel(pos: Vector2, sz: Vector2, color: Color) -> PanelContainer:
	var p = PanelContainer.new()
	p.position = pos
	p.size = sz
	var style = StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = Color(0.15, 0.15, 0.22, 0.8)
	style.border_width_bottom = 1
	style.border_width_top = 1
	p.add_theme_stylebox_override("panel", style)
	return p

func _button(label_text: String, pos: Vector2, sz: Vector2) -> Button:
	var btn = Button.new()
	btn.text = label_text
	btn.position = pos
	btn.size = sz
	btn.add_theme_font_size_override("font_size", 12)
	btn.add_theme_color_override("font_color", Color(0.75, 0.65, 0.9, 1.0))
	return btn

func _find_node(root: Node, target: String) -> Node:
	if root.name == target:
		return root
	for child in root.get_children():
		var r = _find_node(child, target)
		if r:
			return r
	return null

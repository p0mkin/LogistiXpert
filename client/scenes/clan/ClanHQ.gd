extends Control

# ====================================================
# ClanHQ.gd - Syndicate Management & Joint Operations
# Players manage their syndicate/clan, accept massive co-op
# logistics contracts, and view member rosters.
# ====================================================

var BASE_URL: String:
	get: return NetworkManager.HTTP_URL.replace("/api", "")

# Clan states
var clan_data: Dictionary = {}
var joinable_clans: Array = []
var active_contracts: Array = []
var selected_clan_id: String = ""
var clock_lbl: Label = null

# Chat & Roster UI states
var chat_http: HTTPRequest = null
var chat_list: VBoxContainer = null
var chat_input: LineEdit = null
var chat_scroll: ScrollContainer = null

# UI node references
@onready var scene_root = $CanvasLayer
@onready var http = $HTTPRequest
@onready var action_http = $ActionHTTPRequest

func _ready() -> void:
	JuiceEngine.tween_in(scene_root)
	_build_ui()
	
	chat_http = HTTPRequest.new()
	add_child(chat_http)
	chat_http.request_completed.connect(_on_chat_fetch_completed)
	
	NetworkManager.ws_message_received.connect(_on_ws_message_received)
	
	if http:
		http.request_completed.connect(_on_fetch_completed)
	if action_http:
		action_http.request_completed.connect(_on_action_completed)
		
	_fetch_clan_info()
	set_process(true)

func _process(_delta: float) -> void:
	if clock_lbl and is_instance_valid(clock_lbl):
		clock_lbl.text = GameState.get_simulated_time_string()

# ====================================================
# API QUERIES
# ====================================================
func _fetch_clan_info() -> void:
	var headers = ["Authorization: Bearer " + NetworkManager.jwt_token]
	http.request(
		NetworkManager.HTTP_URL + "/clan/info",
		headers,
		HTTPClient.METHOD_GET
	)

func _fetch_joinable_clans() -> void:
	var headers = ["Authorization: Bearer " + NetworkManager.jwt_token]
	http.request(
		NetworkManager.HTTP_URL + "/clan/list",
		headers,
		HTTPClient.METHOD_GET
	)

func _create_clan(clan_name: String) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"name": clan_name})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/create",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _join_clan(clan_id: String) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"clanId": clan_id})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/join",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _leave_clan() -> void:
	var headers = ["Authorization: Bearer " + NetworkManager.jwt_token]
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/leave",
		headers,
		HTTPClient.METHOD_POST
	)

func _publish_contract(title: String, origin: String, destination: String, distance: float, volume: float, pay_clean: float, pay_dirty: float) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({
		"title": title,
		"origin": origin,
		"destination": destination,
		"distanceKm": distance,
		"totalVolume": volume,
		"payoutLegal": pay_clean,
		"payoutBlack": pay_dirty
	})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/contract/publish",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _fetch_chat_messages() -> void:
	if not chat_http or GameState.clan_id.is_empty(): return
	var headers = ["Authorization: Bearer " + NetworkManager.jwt_token]
	chat_http.request(
		NetworkManager.HTTP_URL + "/clan/chat",
		headers,
		HTTPClient.METHOD_GET
	)

func _send_chat_message(text: String) -> void:
	if text.strip_edges().is_empty(): return
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"text": text})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/chat",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _promote_member(target_id: String) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"targetCompanyId": target_id})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/member/promote",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _demote_member(target_id: String) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"targetCompanyId": target_id})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/member/demote",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _kick_member(target_id: String) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"targetCompanyId": target_id})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/member/kick",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

# ====================================================
# UI RENDERING
# ====================================================
func _build_ui() -> void:
	# Clean out previous UI children except nodes
	for child in scene_root.get_children():
		child.queue_free()

	# Cyber theme grid background
	var bg = CyberGridBackground.new()
	bg.primary_color = Color(0.1, 0.45, 0.7, 0.08) # Slate Blue (Faded)
	bg.accent_color = Color(1.0, 0.3, 0.3, 0.05) # Neon Red (Faded)
	scene_root.add_child(bg)

	# TOP HEADER BAR
	var header = _make_panel(Vector2(0, 0), Vector2(1280, 80), Color(0.05, 0.05, 0.07, 0.95))
	scene_root.add_child(header)

	var logo_label = Label.new()
	logo_label.text = "🏴‍☠️  SYNDICATE HEADQUARTERS  🏴‍☠️"
	logo_label.add_theme_font_size_override("font_size", 22)
	logo_label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35))
	logo_label.position = Vector2(24, 24)
	header.add_child(logo_label)

	# Simulated clock label
	clock_lbl = Label.new()
	clock_lbl.name = "ClockLabel"
	clock_lbl.add_theme_font_size_override("font_size", 18)
	clock_lbl.add_theme_color_override("font_color", Color.WHITE)
	clock_lbl.position = Vector2(620, 26)
	clock_lbl.size = Vector2(200, 24)
	clock_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	clock_lbl.text = GameState.get_simulated_time_string()
	header.add_child(clock_lbl)

	var back_btn = _make_button("◀  MAP HUD", Vector2(1130, 19), Vector2(120, 42))
	_style_btn(back_btn, Color(1.0, 0.3, 0.3))
	back_btn.pressed.connect(_go_back)
	header.add_child(back_btn)

	# MAIN VIEW CONTAINER
	var main_box = Control.new()
	main_box.name = "MainBox"
	main_box.position = Vector2(16, 96)
	main_box.size = Vector2(1248, 608)
	scene_root.add_child(main_box)

func _render_no_clan_view(parent: Control) -> void:
	# Clear children of MainBox
	for child in parent.get_children():
		child.queue_free()

	# Left Panel: Create Syndicate & Join
	var left_panel = _make_panel(Vector2(0, 0), Vector2(500, 500), Color(0.06, 0.06, 0.08, 0.95))
	parent.add_child(left_panel)

	var title_create = Label.new()
	title_create.text = "CREATE NEW SYNDICATE"
	title_create.add_theme_font_size_override("font_size", 18)
	title_create.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35))
	title_create.position = Vector2(24, 20)
	left_panel.add_child(title_create)

	var desc_create = Label.new()
	desc_create.text = "Establish a cooperative logistics cartel. Clan owners can initiate high-volume joint operations. Costs $25,000 Clean Cash."
	desc_create.add_theme_font_size_override("font_size", 12)
	desc_create.add_theme_color_override("font_color", Color(0.7, 0.7, 0.8))
	desc_create.position = Vector2(24, 55)
	desc_create.size = Vector2(450, 60)
	desc_create.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left_panel.add_child(desc_create)

	var name_lbl = Label.new()
	name_lbl.text = "SYNDICATE NAME:"
	name_lbl.add_theme_font_size_override("font_size", 13)
	name_lbl.position = Vector2(24, 130)
	left_panel.add_child(name_lbl)

	var name_input = LineEdit.new()
	name_input.name = "ClanNameInput"
	name_input.placeholder_text = "Enter unique clan name..."
	name_input.position = Vector2(24, 155)
	name_input.size = Vector2(450, 38)
	GlobalThemeManager.apply_input_style(name_input)
	left_panel.add_child(name_input)

	var create_btn = _make_button("⚡  FOUND CARTEL ($25K)", Vector2(24, 210), Vector2(450, 44))
	_style_btn(create_btn, Color(1.0, 0.7, 0.2))
	create_btn.pressed.connect(func():
		var name_text = name_input.text.strip_edges()
		if name_text.length() < 3:
			_show_toast("Clan name must be at least 3 characters!")
			return
		_create_clan(name_text)
	)
	left_panel.add_child(create_btn)

	var divider = ColorRect.new()
	divider.color = Color(1.0, 1.0, 1.0, 0.08)
	divider.position = Vector2(24, 280)
	divider.size = Vector2(450, 1)
	left_panel.add_child(divider)

	var title_join = Label.new()
	title_join.text = "JOIN BY ID"
	title_join.add_theme_font_size_override("font_size", 18)
	title_join.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
	title_join.position = Vector2(24, 300)
	left_panel.add_child(title_join)

	var join_input = LineEdit.new()
	join_input.name = "ClanIdInput"
	join_input.placeholder_text = "Enter syndicate ID..."
	join_input.position = Vector2(24, 335)
	join_input.size = Vector2(450, 38)
	GlobalThemeManager.apply_input_style(join_input)
	left_panel.add_child(join_input)

	var join_btn = _make_button("✔  REQUEST MEMBERSHIP", Vector2(24, 390), Vector2(450, 44))
	_style_btn(join_btn, Color(0.2, 0.9, 0.5))
	join_btn.pressed.connect(func():
		var cid = join_input.text.strip_edges()
		if cid.is_empty():
			_show_toast("Please enter a syndicate ID!")
			return
		_join_clan(cid)
	)
	left_panel.add_child(join_btn)

	# Right Panel: Joinable Syndicates Board
	var right_panel = _make_panel(Vector2(520, 0), Vector2(728, 500), Color(0.05, 0.05, 0.06, 0.95))
	parent.add_child(right_panel)

	var board_title = Label.new()
	board_title.text = "ACTIVE WORLD SYNDICATES"
	board_title.add_theme_font_size_override("font_size", 18)
	board_title.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
	board_title.position = Vector2(24, 20)
	right_panel.add_child(board_title)

	var scroll = ScrollContainer.new()
	scroll.position = Vector2(24, 60)
	scroll.size = Vector2(680, 420)
	right_panel.add_child(scroll)

	var list = VBoxContainer.new()
	list.add_theme_constant_override("separation", 8)
	scroll.add_child(list)

	if joinable_clans.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "No syndicates found. Start your own above!"
		empty_lbl.add_theme_font_size_override("font_size", 14)
		empty_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6))
		list.add_child(empty_lbl)
	else:
		for c in joinable_clans:
			var card = PanelContainer.new()
			card.custom_minimum_size = Vector2(660, 60)
			var scard = StyleBoxFlat.new()
			scard.bg_color = Color(0.08, 0.08, 0.1, 0.9)
			scard.border_color = Color(0.2, 0.5, 0.8, 0.4)
			scard.border_width_left = 3
			scard.set_corner_radius_all(6)
			card.add_theme_stylebox_override("panel", scard)
			list.add_child(card)

			var hbox = HBoxContainer.new()
			hbox.alignment = BoxContainer.ALIGNMENT_CENTER
			hbox.add_theme_constant_override("separation", 20)
			card.add_child(hbox)

			# Margin left spacer
			var spacer = Control.new()
			spacer.custom_minimum_size = Vector2(1, 1)
			hbox.add_child(spacer)

			var name_lbl_c = Label.new()
			name_lbl_c.text = c.get("name", "Syndicate")
			name_lbl_c.add_theme_font_size_override("font_size", 15)
			name_lbl_c.add_theme_color_override("font_color", Color.WHITE)
			name_lbl_c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			hbox.add_child(name_lbl_c)

			var rep_lbl = Label.new()
			rep_lbl.text = "Rep: %d" % c.get("reputation", 0)
			rep_lbl.add_theme_font_size_override("font_size", 13)
			rep_lbl.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2))
			hbox.add_child(rep_lbl)

			var mem_lbl = Label.new()
			mem_lbl.text = "Members: %d/%d" % [c.get("memberCount", 0), c.get("maxCompanies", 5)]
			mem_lbl.add_theme_font_size_override("font_size", 13)
			mem_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
			hbox.add_child(mem_lbl)

			var join_c_btn = Button.new()
			join_c_btn.text = "JOIN"
			join_c_btn.custom_minimum_size = Vector2(80, 32)
			GlobalThemeManager.apply_btn_style(join_c_btn, Color(0.2, 0.9, 0.5))
			var cid = c.get("id", "")
			join_c_btn.pressed.connect(func(): _join_clan(cid))
			hbox.add_child(join_c_btn)

			var spacer2 = Control.new()
			spacer2.custom_minimum_size = Vector2(1, 1)
			hbox.add_child(spacer2)

	JuiceEngine.tween_stagger_children(list, 0.04)

func _render_clan_dashboard(parent: Control) -> void:
	# Clear children of MainBox
	for child in parent.get_children():
		child.queue_free()

	# 1. Left: Clan Info & Member Roster
	var left_panel = _make_panel(Vector2(0, 0), Vector2(400, 500), Color(0.06, 0.06, 0.08, 0.95))
	parent.add_child(left_panel)

	var clan_name = Label.new()
	clan_name.text = clan_data.get("name", "Syndicate Name").to_upper()
	clan_name.add_theme_font_size_override("font_size", 20)
	clan_name.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35))
	clan_name.position = Vector2(20, 20)
	left_panel.add_child(clan_name)

	var clan_id_lbl = Label.new()
	clan_id_lbl.text = "ID: " + clan_data.get("id", "")
	clan_id_lbl.add_theme_font_size_override("font_size", 11)
	clan_id_lbl.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6))
	clan_id_lbl.position = Vector2(20, 50)
	left_panel.add_child(clan_id_lbl)

	# Stats grid
	var stats_grid = GridContainer.new()
	stats_grid.columns = 2
	stats_grid.add_theme_constant_override("h_separation", 30)
	stats_grid.add_theme_constant_override("v_separation", 10)
	stats_grid.position = Vector2(20, 80)
	left_panel.add_child(stats_grid)

	var rep_title = Label.new()
	rep_title.text = "Cartel Reputation:"
	rep_title.add_theme_font_size_override("font_size", 13)
	rep_title.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	stats_grid.add_child(rep_title)

	var rep_val = Label.new()
	var total_rep = clan_data.get("reputation", 0)
	rep_val.text = "%d" % total_rep
	rep_val.add_theme_font_size_override("font_size", 13)
	rep_val.add_theme_color_override("font_color", Color(1.0, 0.8, 0.2))
	stats_grid.add_child(rep_val)

	var treasury_title = Label.new()
	treasury_title.text = "Clan Treasury:"
	treasury_title.add_theme_font_size_override("font_size", 13)
	treasury_title.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	stats_grid.add_child(treasury_title)

	var treasury_val = Label.new()
	var total_treasury = clan_data.get("treasury", 0)
	treasury_val.text = "$%s Clean" % _format_money(total_treasury)
	treasury_val.add_theme_font_size_override("font_size", 13)
	treasury_val.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5))
	stats_grid.add_child(treasury_val)

	var cap_title = Label.new()
	cap_title.text = "Cartel Members:"
	cap_title.add_theme_font_size_override("font_size", 13)
	cap_title.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
	stats_grid.add_child(cap_title)

	var cap_val = Label.new()
	var members = clan_data.get("companies", [])
	cap_val.text = "%d / %d" % [members.size(), clan_data.get("maxCompanies", 5)]
	cap_val.add_theme_font_size_override("font_size", 13)
	cap_val.add_theme_color_override("font_color", Color.WHITE)
	stats_grid.add_child(cap_val)

	# Member roster list
	var roster_title = Label.new()
	roster_title.text = "MEMBER ROSTER:"
	roster_title.add_theme_font_size_override("font_size", 14)
	roster_title.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
	roster_title.position = Vector2(20, 160)
	left_panel.add_child(roster_title)

	var scroll = ScrollContainer.new()
	scroll.position = Vector2(20, 185)
	scroll.size = Vector2(360, 90)
	left_panel.add_child(scroll)

	var roster_list = VBoxContainer.new()
	roster_list.add_theme_constant_override("separation", 6)
	scroll.add_child(roster_list)

	# Determine actor's role in the clan
	var my_role = "MEMBER"
	for c in members:
		if c.get("id", "") == GameState.company_id:
			my_role = c.get("role", "MEMBER")
			break

	for c in members:
		var c_row = PanelContainer.new()
		var sc_row = StyleBoxFlat.new()
		sc_row.bg_color = Color(0.08, 0.08, 0.1, 0.6)
		sc_row.border_width_left = 2
		sc_row.border_color = Color(0.3, 0.85, 1.0, 0.4)
		sc_row.set_corner_radius_all(4)
		c_row.add_theme_stylebox_override("panel", sc_row)
		roster_list.add_child(c_row)

		var hbox = HBoxContainer.new()
		hbox.add_theme_constant_override("separation", 6)
		c_row.add_child(hbox)

		var c_spacer = Control.new()
		c_spacer.custom_minimum_size = Vector2(1, 1)
		hbox.add_child(c_spacer)

		var target_id = c.get("id", "")
		var target_role = c.get("role", "MEMBER")

		var c_name = Label.new()
		c_name.text = c.get("name", "Company") + " [" + target_role + "]"
		c_name.add_theme_font_size_override("font_size", 11)
		c_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hbox.add_child(c_name)

		var c_rep = Label.new()
		c_rep.text = "⚡%d" % c.get("reputationScore", 0)
		c_rep.add_theme_font_size_override("font_size", 10)
		c_rep.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2))
		hbox.add_child(c_rep)

		# Admin buttons
		if target_id != GameState.company_id:
			if my_role == "OWNER":
				if target_role == "MEMBER":
					var prom_btn = Button.new()
					prom_btn.text = "PROM"
					prom_btn.custom_minimum_size = Vector2(40, 18)
					prom_btn.add_theme_font_size_override("font_size", 9)
					GlobalThemeManager.apply_btn_style(prom_btn, Color(0.2, 0.9, 0.5))
					prom_btn.pressed.connect(func(): _promote_member(target_id))
					hbox.add_child(prom_btn)

					var kick_btn = Button.new()
					kick_btn.text = "KICK"
					kick_btn.custom_minimum_size = Vector2(35, 18)
					kick_btn.add_theme_font_size_override("font_size", 9)
					GlobalThemeManager.apply_btn_style(kick_btn, Color(1.0, 0.3, 0.3))
					kick_btn.pressed.connect(func(): _kick_member(target_id))
					hbox.add_child(kick_btn)
				elif target_role == "OFFICER":
					var dem_btn = Button.new()
					dem_btn.text = "DEM"
					dem_btn.custom_minimum_size = Vector2(40, 18)
					dem_btn.add_theme_font_size_override("font_size", 9)
					GlobalThemeManager.apply_btn_style(dem_btn, Color(1.0, 0.7, 0.2))
					dem_btn.pressed.connect(func(): _demote_member(target_id))
					hbox.add_child(dem_btn)

					var kick_btn = Button.new()
					kick_btn.text = "KICK"
					kick_btn.custom_minimum_size = Vector2(35, 18)
					kick_btn.add_theme_font_size_override("font_size", 9)
					GlobalThemeManager.apply_btn_style(kick_btn, Color(1.0, 0.3, 0.3))
					kick_btn.pressed.connect(func(): _kick_member(target_id))
					hbox.add_child(kick_btn)
			elif my_role == "OFFICER":
				if target_role == "MEMBER":
					var kick_btn = Button.new()
					kick_btn.text = "KICK"
					kick_btn.custom_minimum_size = Vector2(35, 18)
					kick_btn.add_theme_font_size_override("font_size", 9)
					GlobalThemeManager.apply_btn_style(kick_btn, Color(1.0, 0.3, 0.3))
					kick_btn.pressed.connect(func(): _kick_member(target_id))
					hbox.add_child(kick_btn)

		var c_spacer2 = Control.new()
		c_spacer2.custom_minimum_size = Vector2(1, 1)
		hbox.add_child(c_spacer2)

	# 1.5. Clan Trophy Room / Milestones Showcase
	var trophy_title = Label.new()
	trophy_title.text = "CARTEL TROPHY ROOM:"
	trophy_title.add_theme_font_size_override("font_size", 14)
	trophy_title.add_theme_color_override("font_color", Color(1.0, 0.8, 0.2))
	trophy_title.position = Vector2(20, 280)
	left_panel.add_child(trophy_title)

	var trophy_panel = PanelContainer.new()
	trophy_panel.position = Vector2(20, 300)
	trophy_panel.size = Vector2(360, 50)
	var strophy = StyleBoxFlat.new()
	strophy.bg_color = Color(0.04, 0.04, 0.06, 0.8)
	strophy.border_color = Color(1.0, 0.8, 0.2, 0.2)
	strophy.border_width_left = 3
	strophy.set_corner_radius_all(4)
	trophy_panel.add_theme_stylebox_override("panel", strophy)
	left_panel.add_child(trophy_panel)

	var trophy_hbox = HBoxContainer.new()
	trophy_hbox.add_theme_constant_override("separation", 10)
	trophy_hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	trophy_panel.add_child(trophy_hbox)

	var trophies_awarded = 0
	if total_rep >= 500:
		var t1 = Label.new()
		t1.text = "🏆 Legendary"
		t1.tooltip_text = "Cartel reputation has exceeded 500."
		t1.add_theme_color_override("font_color", Color(1.0, 0.8, 0.2))
		t1.add_theme_font_size_override("font_size", 11)
		trophy_hbox.add_child(t1)
		trophies_awarded += 1
	if total_treasury >= 50000:
		var t2 = Label.new()
		t2.text = "💼 High Cash"
		t2.tooltip_text = "Syndicate treasury exceeds $50K."
		t2.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5))
		t2.add_theme_font_size_override("font_size", 11)
		trophy_hbox.add_child(t2)
		trophies_awarded += 1
	if members.size() >= 3:
		var t3 = Label.new()
		t3.text = "🚚 Syndicate"
		t3.tooltip_text = "Three or more companies belong to this syndicate."
		t3.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
		t3.add_theme_font_size_override("font_size", 11)
		trophy_hbox.add_child(t3)
		trophies_awarded += 1

	if trophies_awarded == 0:
		var no_t = Label.new()
		no_t.text = "No milestones completed yet. Expand syndicate!"
		no_t.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6))
		no_t.add_theme_font_size_override("font_size", 11)
		trophy_hbox.add_child(no_t)

	# 1.6. Clan Mutual Protection Fund Contribution (v0.7.1)
	var prot_title = Label.new()
	prot_title.text = "MUTUAL PROTECTION FUND:"
	prot_title.add_theme_font_size_override("font_size", 11)
	prot_title.add_theme_color_override("font_color", Color(0.7, 0.4, 1.0))
	prot_title.position = Vector2(20, 356)
	left_panel.add_child(prot_title)

	var prot_hbox = HBoxContainer.new()
	prot_hbox.position = Vector2(20, 374)
	prot_hbox.size = Vector2(360, 34)
	prot_hbox.add_theme_constant_override("separation", 10)
	left_panel.add_child(prot_hbox)

	var prot_input = LineEdit.new()
	prot_input.placeholder_text = "Contribute BM cash..."
	prot_input.text = "10000"
	prot_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	GlobalThemeManager.apply_input_style(prot_input)
	prot_hbox.add_child(prot_input)

	var prot_btn = Button.new()
	prot_btn.text = "CONTRIBUTE"
	prot_btn.custom_minimum_size = Vector2(120, 0)
	GlobalThemeManager.apply_btn_style(prot_btn, Color(0.7, 0.4, 1.0))
	prot_btn.pressed.connect(func():
		var val = float(prot_input.text)
		if val > 0:
			_contribute_protection_fund(val)
	)
	prot_hbox.add_child(prot_btn)

	var leave_y = 420

	# 1.7. Clan Treasury Distributions
	if my_role == "OWNER" or my_role == "OFFICER":
		var dist_title = Label.new()
		dist_title.text = "DISTRIBUTE TREASURY:"
		dist_title.add_theme_font_size_override("font_size", 11)
		dist_title.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5))
		dist_title.position = Vector2(20, 414)
		left_panel.add_child(dist_title)

		var dist_hbox = HBoxContainer.new()
		dist_hbox.position = Vector2(20, 432)
		dist_hbox.size = Vector2(360, 34)
		dist_hbox.add_theme_constant_override("separation", 10)
		left_panel.add_child(dist_hbox)

		var dist_input = LineEdit.new()
		dist_input.placeholder_text = "Amount..."
		dist_input.text = "5000"
		dist_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		GlobalThemeManager.apply_input_style(dist_input)
		dist_hbox.add_child(dist_input)

		var dist_btn = Button.new()
		dist_btn.text = "PAY MEMBERS"
		dist_btn.custom_minimum_size = Vector2(120, 0)
		GlobalThemeManager.apply_btn_style(dist_btn, Color(0.2, 0.9, 0.5))
		dist_btn.pressed.connect(func():
			var val = float(dist_input.text)
			if val > 0:
				_distribute_treasury(val)
		)
		dist_hbox.add_child(dist_btn)
		leave_y = 472

	var leave_btn = _make_button("✕  LEAVE CARTEL", Vector2(20, leave_y), Vector2(360, 26))
	_style_btn(leave_btn, Color(1.0, 0.3, 0.3))
	leave_btn.pressed.connect(_leave_clan)
	left_panel.add_child(leave_btn)

	# 2. Right: Split Column - Cartel Joint Operations & Secure Chat
	var right_panel = _make_panel(Vector2(420, 0), Vector2(828, 500), Color(0.05, 0.05, 0.06, 0.95))
	parent.add_child(right_panel)

	# Left Column: Active Joint Operations
	var ops_title = Label.new()
	ops_title.text = "ACTIVE CARTEL JOINT OPERATIONS"
	ops_title.add_theme_font_size_override("font_size", 16)
	ops_title.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35))
	ops_title.position = Vector2(24, 20)
	right_panel.add_child(ops_title)

	var contract_scroll = ScrollContainer.new()
	contract_scroll.position = Vector2(24, 60)
	contract_scroll.size = Vector2(370, 240)
	right_panel.add_child(contract_scroll)

	var contract_list = VBoxContainer.new()
	contract_list.add_theme_constant_override("separation", 10)
	contract_scroll.add_child(contract_list)

	var active_cc = clan_data.get("clanContracts", [])
	if active_cc.is_empty():
		var empty_cc = Label.new()
		empty_cc.text = "No active joint operations."
		empty_cc.add_theme_font_size_override("font_size", 13)
		empty_cc.add_theme_color_override("font_color", Color(0.5, 0.5, 0.6))
		contract_list.add_child(empty_cc)
	else:
		for cc in active_cc:
			var cc_card = PanelContainer.new()
			cc_card.custom_minimum_size = Vector2(340, 95)
			var scc = StyleBoxFlat.new()
			scc.bg_color = Color(0.08, 0.08, 0.1, 0.95)
			scc.border_color = Color(1.0, 0.3, 0.3, 0.4)
			scc.border_width_left = 4
			scc.set_corner_radius_all(8)
			cc_card.add_theme_stylebox_override("panel", scc)
			contract_list.add_child(cc_card)

			var cc_vbox = VBoxContainer.new()
			cc_vbox.add_theme_constant_override("separation", 6)
			cc_card.add_child(cc_vbox)

			var header_hbox = HBoxContainer.new()
			cc_vbox.add_child(header_hbox)

			var title_lbl = Label.new()
			title_lbl.text = cc.get("title", "Operation")
			title_lbl.add_theme_font_size_override("font_size", 13)
			title_lbl.add_theme_color_override("font_color", Color.WHITE)
			title_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			header_hbox.add_child(title_lbl)

			var origin_dest = Label.new()
			origin_dest.text = "%s➔%s" % [cc.get("origin", ""), cc.get("destination", "")]
			origin_dest.add_theme_font_size_override("font_size", 11)
			origin_dest.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7))
			header_hbox.add_child(origin_dest)

			# Progress Bar
			var progress_bg = ColorRect.new()
			progress_bg.custom_minimum_size = Vector2(320, 16)
			progress_bg.color = Color(0.05, 0.05, 0.05, 0.8)
			cc_vbox.add_child(progress_bg)

			var delivered = float(cc.get("volumeDelivered", 0.0))
			var total = float(cc.get("totalVolume", 1000.0))
			var pct = delivered / total if total > 0 else 0.0

			var progress_fill = ColorRect.new()
			progress_fill.color = Color(0.2, 0.8, 0.4)
			progress_fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
			progress_fill.anchor_right = pct
			progress_bg.add_child(progress_fill)

			var progress_lbl = Label.new()
			progress_lbl.text = "%.1f/%.1f u" % [delivered, total]
			progress_lbl.add_theme_font_size_override("font_size", 10)
			progress_lbl.add_theme_color_override("font_color", Color.WHITE)
			progress_lbl.set_anchors_preset(Control.PRESET_CENTER)
			progress_bg.add_child(progress_lbl)

			# Payout
			var bottom_hbox = HBoxContainer.new()
			cc_vbox.add_child(bottom_hbox)

			var payout_lbl = Label.new()
			payout_lbl.text = "$%s C | $%s D" % [_format_money(cc.get("payoutLegal", 0)), _format_money(cc.get("payoutBlack", 0))]
			payout_lbl.add_theme_font_size_override("font_size", 11)
			payout_lbl.add_theme_color_override("font_color", Color(0.2, 0.9, 0.5))
			payout_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			bottom_hbox.add_child(payout_lbl)

	# Right Column: Cartel Secure Chat board
	var chat_title = Label.new()
	chat_title.text = "CARTEL SECURE CHAT"
	chat_title.add_theme_font_size_override("font_size", 16)
	chat_title.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0))
	chat_title.position = Vector2(424, 20)
	right_panel.add_child(chat_title)

	chat_scroll = ScrollContainer.new()
	chat_scroll.position = Vector2(424, 60)
	chat_scroll.size = Vector2(380, 200)
	right_panel.add_child(chat_scroll)

	chat_list = VBoxContainer.new()
	chat_list.add_theme_constant_override("separation", 6)
	chat_scroll.add_child(chat_list)

	# Chat input line
	chat_input = LineEdit.new()
	chat_input.placeholder_text = "Secure message..."
	chat_input.position = Vector2(424, 270)
	chat_input.size = Vector2(280, 32)
	GlobalThemeManager.apply_input_style(chat_input)
	chat_input.text_submitted.connect(func(txt):
		_send_chat_message(txt)
		chat_input.text = ""
	)
	right_panel.add_child(chat_input)

	# Send Button
	var send_btn = _make_button("SEND", Vector2(714, 270), Vector2(90, 32))
	_style_btn(send_btn, Color(0.3, 0.85, 1.0))
	send_btn.pressed.connect(func():
		_send_chat_message(chat_input.text)
		chat_input.text = ""
	)
	right_panel.add_child(send_btn)

	# Publish contract board below
	var pub_panel = PanelContainer.new()
	pub_panel.position = Vector2(24, 320)
	pub_panel.size = Vector2(780, 160)
	var spub = StyleBoxFlat.new()
	spub.bg_color = Color(0.08, 0.08, 0.1, 0.4)
	spub.border_color = Color(1.0, 1.0, 1.0, 0.08)
	spub.border_width_top = 1
	spub.set_corner_radius_all(6)
	pub_panel.add_theme_stylebox_override("panel", spub)
	right_panel.add_child(pub_panel)

	var pub_vbox = VBoxContainer.new()
	pub_vbox.add_theme_constant_override("separation", 10)
	pub_panel.add_child(pub_vbox)

	var pub_title = Label.new()
	pub_title.text = "PUBLISH NEW JOINT CARTEL OPERATION"
	pub_title.add_theme_font_size_override("font_size", 14)
	pub_title.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2))
	pub_vbox.add_child(pub_title)

	var inputs_hbox = HBoxContainer.new()
	inputs_hbox.add_theme_constant_override("separation", 12)
	pub_vbox.add_child(inputs_hbox)

	var title_in = LineEdit.new()
	title_in.placeholder_text = "Operation Name..."
	title_in.custom_minimum_size = Vector2(160, 32)
	GlobalThemeManager.apply_input_style(title_in)
	inputs_hbox.add_child(title_in)

	var route_in = LineEdit.new()
	route_in.placeholder_text = "Origin -> Dest..."
	route_in.text = "Kaunas -> Riga"
	route_in.custom_minimum_size = Vector2(140, 32)
	GlobalThemeManager.apply_input_style(route_in)
	inputs_hbox.add_child(route_in)

	var vol_in = LineEdit.new()
	vol_in.placeholder_text = "Volume (e.g. 5000)..."
	vol_in.text = "5000"
	vol_in.custom_minimum_size = Vector2(120, 32)
	GlobalThemeManager.apply_input_style(vol_in)
	inputs_hbox.add_child(vol_in)

	var clean_pay = LineEdit.new()
	clean_pay.placeholder_text = "Clean Payout..."
	clean_pay.text = "85000"
	clean_pay.custom_minimum_size = Vector2(100, 32)
	GlobalThemeManager.apply_input_style(clean_pay)
	inputs_hbox.add_child(clean_pay)

	var dirty_pay = LineEdit.new()
	dirty_pay.placeholder_text = "Dirty Payout..."
	dirty_pay.text = "15000"
	dirty_pay.custom_minimum_size = Vector2(100, 32)
	GlobalThemeManager.apply_input_style(dirty_pay)
	inputs_hbox.add_child(dirty_pay)

	var pub_btn = Button.new()
	pub_btn.text = "⚡  PUBLISH"
	pub_btn.custom_minimum_size = Vector2(120, 34)
	GlobalThemeManager.apply_btn_style(pub_btn, Color(1.0, 0.7, 0.2))
	pub_vbox.add_child(pub_btn)

	pub_btn.pressed.connect(func():
		var t = title_in.text.strip_edges()
		if t.length() < 3:
			_show_toast("Operation name must be at least 3 characters!")
			return
		var parts = route_in.text.split("->")
		if parts.size() != 2:
			_show_toast("Route must be formatted as 'Origin -> Dest'!")
			return
		var origin = parts[0].strip_edges()
		var dest = parts[1].strip_edges()
		var vol = float(vol_in.text)
		var c_pay = float(clean_pay.text)
		var d_pay = float(dirty_pay.text)
		if vol <= 0 or c_pay < 0 or d_pay < 0:
			_show_toast("Invalid volume or payout values!")
			return
		_publish_contract(t, origin, dest, 290.0, vol, c_pay, d_pay)
	)

	JuiceEngine.tween_stagger_children(roster_list, 0.04)
	JuiceEngine.tween_stagger_children(contract_list, 0.05)

# ====================================================
# NETWORK HANDLERS
# ====================================================
func _on_fetch_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code == 200:
		var json = JSON.parse_string(body.get_string_from_utf8())
		if json:
			if json.has("inClan") and json.inClan:
				clan_data = json.clan
				# Update global GameState
				GameState.clan_id = clan_data.id
				_render_clan_dashboard(scene_root.get_node("MainBox"))
				_fetch_chat_messages()
			else:
				# Clear global GameState clan status
				GameState.clan_id = ""
				_fetch_joinable_clans()
	else:
		# Fallback to lists
		var json = JSON.parse_string(body.get_string_from_utf8())
		if json and json.has("error"):
			_show_toast("✕ Error: " + json.error)
		else:
			# If /clan/info is 400 (not in clan) or similar, fetch clans lists
			_fetch_joinable_clans()

func _on_chat_fetch_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code == 200:
		var messages = JSON.parse_string(body.get_string_from_utf8())
		if messages and chat_list:
			for child in chat_list.get_children():
				child.queue_free()
			for msg in messages:
				_append_chat_message(msg)

func _on_ws_message_received(packet: Dictionary) -> void:
	var type = packet.get("type", "")
	var payload = packet.get("payload", {})
	match type:
		"clan:chat_message":
			_append_chat_message(payload)
		"clan:member_promoted", "clan:member_demoted", "clan:member_kicked", "clan:member_joined", "clan:member_left":
			_fetch_clan_info()

func _append_chat_message(msg: Dictionary) -> void:
	if not chat_list or not is_instance_valid(chat_list): return
	var row = PanelContainer.new()
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.08, 0.1, 0.5)
	style.border_width_left = 2
	style.border_color = Color(0.3, 0.85, 1.0, 0.3)
	style.set_corner_radius_all(4)
	row.add_theme_stylebox_override("panel", style)
	chat_list.add_child(row)

	var hbox = HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 8)
	row.add_child(hbox)

	var sender = Label.new()
	sender.text = "[" + msg.get("senderName", "Unknown") + "]:"
	sender.add_theme_font_size_override("font_size", 12)
	sender.add_theme_color_override("font_color", Color(0.3, 0.85, 1.0) if msg.get("senderId", "") != GameState.company_id else Color(0.2, 0.9, 0.5))
	hbox.add_child(sender)

	var txt = Label.new()
	txt.text = msg.get("text", "")
	txt.add_theme_font_size_override("font_size", 12)
	txt.add_theme_color_override("font_color", Color.WHITE)
	txt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	txt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hbox.add_child(txt)

	# Scroll to bottom
	await get_tree().process_frame
	if chat_scroll:
		chat_scroll.scroll_vertical = chat_scroll.get_v_scroll_bar().max_value

func _on_action_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code in [200, 201]:
		var json = JSON.parse_string(body.get_string_from_utf8())
		var msg = json.get("message", "Success!") if json else "Success!"
		_show_toast("✔ " + msg, Color(0.2, 0.9, 0.5))
		# Refresh clan info
		_fetch_clan_info()
	else:
		var json = JSON.parse_string(body.get_string_from_utf8())
		var err_msg = json.get("message", json.get("error", "UNKNOWN")) if json else "Network error."
		_show_toast("✕ Failed: " + err_msg, Color(1.0, 0.3, 0.3))

# ====================================================
# HELPER WIDGETS
# ====================================================
func _make_panel(pos: Vector2, sz: Vector2, color: Color) -> Control:
	var control = Control.new()
	control.position = pos
	control.size = sz
	control.custom_minimum_size = sz
	
	var p = PanelContainer.new()
	p.position = Vector2.ZERO
	p.size = sz
	p.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	GlobalThemeManager.apply_glass(p, "standard")
	
	control.add_child(p)
	return control

func _make_button(label_text: String, pos: Vector2, sz: Vector2) -> Button:
	var btn = Button.new()
	btn.text = label_text
	btn.position = pos
	btn.size = sz
	btn.add_theme_font_size_override("font_size", 13)
	GlobalThemeManager.apply_btn_style(btn, Color(0.1, 0.6, 1.0))
	return btn

func _style_btn(btn: Button, color: Color) -> void:
	GlobalThemeManager.apply_btn_style(btn, color)

func _show_toast(msg: String, color: Color = Color(1.0, 0.8, 0.2, 1.0)) -> void:
	var toast = Label.new()
	toast.text = msg
	toast.add_theme_font_size_override("font_size", 14)
	toast.add_theme_color_override("font_color", color)
	toast.position = Vector2(400, 600)
	toast.size = Vector2(480, 30)
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	scene_root.add_child(toast)
	var tween = create_tween()
	tween.tween_property(toast, "modulate:a", 0.0, 2.5)
	tween.tween_callback(toast.queue_free)

func _format_money(amount: float) -> String:
	if amount >= 1000000.0:
		return "%.1fM" % (amount / 1000000.0)
	if amount >= 1000.0:
		return "%.1fK" % (amount / 1000.0)
	return str(int(amount))

func _go_back() -> void:
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

func _distribute_treasury(amount: float) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"amount": amount})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/treasury/distribute",
		headers,
		HTTPClient.METHOD_POST,
		body
	)

func _contribute_protection_fund(amount: float) -> void:
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token]
	var body = JSON.stringify({"amount": amount})
	action_http.request(
		NetworkManager.HTTP_URL + "/clan/protection-fund/contribute",
		headers,
		HTTPClient.METHOD_POST,
		body
	)


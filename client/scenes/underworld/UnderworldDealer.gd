extends Control

# ====================================================
# UnderworldDealer.gd - Shady Contraband Market Scene
# Players browse illicit jobs, inspect risk vs payout,
# and take Class A/B/C smuggling contracts
# ====================================================

var BASE_URL: String:
	get: return NetworkManager.HTTP_URL.replace("/api", "")

# Dealer flavor personalities — randomly assigned on scene load
const DEALER_PERSONAS = [
	{
		"name": "Viktor \"The Chemist\" Razov",
		"city": "Minsk",
		"specialty": "CLASS_B",
		"greeting": "You look like someone who appreciates chemistry. I have product that needs warm storage and fast wheels.",
		"avatar_color": Color(0.6, 0.1, 0.8, 1.0),
	},
	{
		"name": "Marta Liekis",
		"city": "Kaunas",
		"specialty": "CLASS_A",
		"greeting": "Low risk, high volume. Phones, chips, untaxed tobacco. Nobody cares. I care. You get paid.",
		"avatar_color": Color(0.2, 0.7, 0.4, 1.0),
	},
	{
		"name": "Bogdan \"Iron\" Petrenko",
		"city": "Brest",
		"specialty": "CLASS_C",
		"greeting": "This cargo does not ask questions. Neither do I. Neither should you.",
		"avatar_color": Color(0.9, 0.2, 0.15, 1.0),
	},
]

# Live job listings fetched from server
var available_jobs: Array = []
var selected_job: Dictionary = {}
var active_dealer: Dictionary = {}
var player_truck_id: String = ""
var player_trucks: Array = []
var clock_lbl: Label = null

# UI node references
@onready var scene_root = $CanvasLayer
@onready var http = $HTTPRequest
@onready var hire_http = $HireHTTPRequest

func _ready() -> void:
	JuiceEngine.tween_in(scene_root)
	active_dealer = DEALER_PERSONAS[randi() % DEALER_PERSONAS.size()]
	_build_ui()
	if hire_http:
		hire_http.request_completed.connect(_on_accept_response)
	_fetch_garage_data()
	set_process(true)

func _process(_delta: float) -> void:
	if clock_lbl and is_instance_valid(clock_lbl):
		clock_lbl.text = GameState.get_simulated_time_string()


# ====================================================
# BUILD THE FULL UI PROCEDURALLY
# ====================================================
func _build_ui() -> void:
	# Deep underworld atmosphere with animated cyber grid
	var bg = CyberGridBackground.new()
	bg.primary_color = Color(0.65, 0.45, 1.0, 0.08) # Underworld Purple (Faded)
	bg.accent_color = Color(1.0, 0.25, 0.25, 0.06) # Crimson (Faded)
	scene_root.add_child(bg)

	# TOP HEADER BAR
	var header = _make_panel(Vector2(0, 0), Vector2(1280, 80), Color(0.08, 0.04, 0.12, 0.95))
	scene_root.add_child(header)

	var logo_label = Label.new()
	logo_label.text = "▼ UNDERWORLD MARKET — CLASSIFIED CONTRACTS ▼"
	logo_label.add_theme_font_size_override("font_size", 20)
	logo_label.add_theme_color_override("font_color", Color(0.7, 0.0, 1.0, 1.0))
	logo_label.position = Vector2(24, 26)
	header.add_child(logo_label)

	# Heat indicator in header (Visual Meter)
	var heat_container = HBoxContainer.new()
	heat_container.position = Vector2(750, 26)
	heat_container.size = Vector2(250, 24)
	heat_container.add_theme_constant_override("separation", 10)
	
	var heat_label = Label.new()
	heat_label.text = "☢ HEAT:"
	heat_label.add_theme_font_size_override("font_size", 18)
	heat_label.add_theme_color_override("font_color", _heat_color(GameState.police_heat))
	heat_label.name = "HeatLabel"
	heat_container.add_child(heat_label)
	
	var heat_bar_bg = ColorRect.new()
	heat_bar_bg.color = Color(0.1, 0.05, 0.1, 0.8)
	heat_bar_bg.custom_minimum_size = Vector2(150, 16)
	heat_bar_bg.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	
	var heat_bar_fill = ColorRect.new()
	heat_bar_fill.color = _heat_color(GameState.police_heat)
	heat_bar_fill.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	heat_bar_fill.anchor_right = float(GameState.police_heat) / 100.0
	heat_bar_fill.name = "HeatFill"
	heat_bar_bg.add_child(heat_bar_fill)
	
	var heat_val_lbl = Label.new()
	heat_val_lbl.text = "%d%%" % GameState.police_heat
	heat_val_lbl.add_theme_font_size_override("font_size", 12)
	heat_val_lbl.add_theme_color_override("font_color", Color.WHITE)
	heat_val_lbl.set_anchors_preset(Control.PRESET_CENTER)
	heat_val_lbl.name = "HeatValLbl"
	heat_bar_bg.add_child(heat_val_lbl)
	
	heat_container.add_child(heat_bar_bg)
	header.add_child(heat_container)

	if GameState.police_heat >= 70:
		var alert_lbl = Label.new()
		alert_lbl.text = "🚨 WARNING: EXTREME HEAT. RAID IMMINENT."
		alert_lbl.add_theme_font_size_override("font_size", 14)
		alert_lbl.add_theme_color_override("font_color", Color(1.0, 0.2, 0.2))
		alert_lbl.position = Vector2(750, 50)
		header.add_child(alert_lbl)
		var t = create_tween().set_loops()
		t.tween_property(alert_lbl, "modulate:a", 0.3, 0.5)
		t.tween_property(alert_lbl, "modulate:a", 1.0, 0.5)

	# Simulated clock label in header
	clock_lbl = Label.new()
	clock_lbl.name = "ClockLabel"
	clock_lbl.add_theme_font_size_override("font_size", 18)
	clock_lbl.add_theme_color_override("font_color", Color(1, 1, 1)) # Pure White
	clock_lbl.position = Vector2(620, 26)
	clock_lbl.size = Vector2(200, 24)
	clock_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	clock_lbl.text = GameState.get_simulated_time_string()
	header.add_child(clock_lbl)


	var back_btn = _make_button("◀  HUB", Vector2(1140, 19), Vector2(110, 42))
	_style_btn(back_btn, Color(1.0, 0.25, 0.25)) # Crimson Warnings for exit
	back_btn.pressed.connect(_go_back)
	header.add_child(back_btn)

	# MAIN LAYOUT — Three column panels starting at y = 100 with a 20px gap from 80px header
	# Left: Dealer persona card (Expanded width to 320 for text readability)
	var dealer_panel = _make_panel(Vector2(16, 100), Vector2(320, 560), Color(0.07, 0.04, 0.1, 0.9))
	scene_root.add_child(dealer_panel)
	_build_dealer_card(dealer_panel)

	# Center: Contract listings (Optimized width 580)
	var contracts_panel = _make_panel(Vector2(352, 100), Vector2(580, 560), Color(0.06, 0.06, 0.08, 0.9))
	contracts_panel.name = "ContractsPanel"
	scene_root.add_child(contracts_panel)
	_build_contracts_header(contracts_panel)

	var contracts_scroll = ScrollContainer.new()
	contracts_scroll.position = Vector2(8, 90)
	contracts_scroll.size = Vector2(564, 460)
	contracts_scroll.name = "ContractsScroll"
	contracts_panel.add_child(contracts_scroll)

	var contracts_list = VBoxContainer.new()
	contracts_list.name = "ContractsList"
	contracts_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	contracts_scroll.add_child(contracts_list)

	# Right: Job detail / risk breakdown panel (Optimized width 316)
	var detail_panel = _make_panel(Vector2(948, 100), Vector2(316, 560), Color(0.07, 0.04, 0.1, 0.9))
	detail_panel.name = "DetailPanel"
	scene_root.add_child(detail_panel)
	_build_detail_placeholder(detail_panel)

	# BOTTOM — Status bar
	var status_bar = _make_panel(Vector2(0, 676), Vector2(1280, 44), Color(0.05, 0.03, 0.08, 0.95))
	scene_root.add_child(status_bar)

	var status_label = Label.new()
	status_label.text = "💰 Legal: $%.0f   💜 Black Market: $%.0f   🚛 Active Truck: Select from Garage" % [
		GameState.legal_balance, GameState.black_market_balance
	]
	status_label.add_theme_font_size_override("font_size", 12)
	status_label.add_theme_color_override("font_color", Color(0.6, 0.6, 0.7, 1.0))
	status_label.position = Vector2(16, 14)
	status_label.name = "StatusLabel"
	status_bar.add_child(status_label)

# ====================================================
# DEALER PERSONA CARD (LEFT PANEL)
# ====================================================
func _build_dealer_card(parent: Control) -> void:
	# Avatar box with rounded corners and border
	var avatar = PanelContainer.new()
	avatar.position = Vector2(110, 15)
	avatar.size = Vector2(100, 100)
	var savatar = StyleBoxFlat.new()
	savatar.bg_color = active_dealer.avatar_color
	savatar.border_color = Color(0.65, 0.45, 1.0, 0.4)
	savatar.set_border_width_all(2)

	savatar.set_corner_radius_all(50) # Circle!
	avatar.add_theme_stylebox_override("panel", savatar)
	parent.add_child(avatar)

	# Skull overlay on avatar (simple label)
	var skull = Label.new()
	skull.text = "💀"
	skull.add_theme_font_size_override("font_size", 48)
	skull.position = Vector2(126, 23)
	parent.add_child(skull)

	# Name
	var name_lbl = Label.new()
	name_lbl.text = active_dealer.name
	name_lbl.add_theme_font_size_override("font_size", 18)
	name_lbl.add_theme_color_override("font_color", Color(0.9, 0.7, 1.0, 1.0))
	name_lbl.position = Vector2(15, 125)
	name_lbl.size = Vector2(290, 40)
	name_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(name_lbl)

	var city_lbl = Label.new()
	city_lbl.text = "📍 " + active_dealer.city
	city_lbl.add_theme_font_size_override("font_size", 14)
	city_lbl.add_theme_color_override("font_color", Color(0.5, 0.4, 0.6, 1.0))
	city_lbl.position = Vector2(15, 170)
	parent.add_child(city_lbl)

	var specialty_lbl = Label.new()
	specialty_lbl.text = "Specialty: " + active_dealer.specialty.replace("CLASS_", "Class ")
	specialty_lbl.add_theme_font_size_override("font_size", 14)
	specialty_lbl.add_theme_color_override("font_color", _class_color(active_dealer.specialty))
	specialty_lbl.position = Vector2(15, 195)
	parent.add_child(specialty_lbl)

	# Divider
	var div = ColorRect.new()
	div.color = Color(0.3, 0.0, 0.5, 0.5)
	div.position = Vector2(15, 222)
	div.size = Vector2(290, 1)
	parent.add_child(div)

	# Greeting text
	var greeting = Label.new()
	greeting.text = "\"" + active_dealer.greeting + "\""
	greeting.add_theme_font_size_override("font_size", 13)
	greeting.add_theme_color_override("font_color", Color(0.65, 0.55, 0.7, 1.0))
	greeting.position = Vector2(15, 234)
	greeting.size = Vector2(290, 110)
	greeting.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(greeting)

	# Risk warning
	var warning = Label.new()
	warning.text = "⚠ ALL TRANSACTIONS ARE FINAL\n⚠ DO NOT SPEAK TO POLICE\n⚠ DRIVER LOYALTY MATTERS"
	warning.add_theme_font_size_override("font_size", 12)
	warning.add_theme_color_override("font_color", Color(0.8, 0.3, 0.3, 0.8))
	warning.position = Vector2(15, 435)
	warning.size = Vector2(290, 90)
	warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(warning)

	# Truck selector
	var truck_label = Label.new()
	truck_label.text = "🚛 SELECT TRUCK FOR CONTRACT:"
	truck_label.add_theme_font_size_override("font_size", 13)
	truck_label.add_theme_color_override("font_color", Color(0.7, 0.6, 0.8, 1.0))
	truck_label.position = Vector2(15, 355)
	parent.add_child(truck_label)

	var truck_select = OptionButton.new()
	truck_select.position = Vector2(15, 380)
	truck_select.size = Vector2(290, 36)
	truck_select.name = "TruckSelect"
	_style_btn(truck_select, Color(0.65, 0.45, 1.0))
	truck_select.item_selected.connect(_on_truck_selected)
	parent.add_child(truck_select)

# ====================================================
# CONTRACTS PANEL HEADER
# ====================================================
func _build_contracts_header(parent: Control) -> void:
	var header = Label.new()
	header.text = "📋 AVAILABLE CONTRACTS"
	header.add_theme_font_size_override("font_size", 18)
	header.add_theme_color_override("font_color", Color(0.8, 0.5, 1.0, 1.0))
	header.position = Vector2(12, 10)
	parent.add_child(header)

	# Filter buttons (styled larger with y = 46 and 32px height)
	var filter_all = _make_button("ALL", Vector2(12, 46), Vector2(70, 32))
	_style_btn(filter_all, Color(0.65, 0.45, 1.0))
	filter_all.pressed.connect(func(): _filter_jobs("ALL"))
	parent.add_child(filter_all)

	var filter_a = _make_button("CLASS A", Vector2(88, 46), Vector2(85, 32))
	_style_btn(filter_a, Color(0.2, 0.9, 0.5))
	filter_a.pressed.connect(func(): _filter_jobs("CLASS_A"))
	parent.add_child(filter_a)

	var filter_b = _make_button("CLASS B", Vector2(179, 46), Vector2(85, 32))
	_style_btn(filter_b, Color(1.0, 0.6, 0.1))
	filter_b.pressed.connect(func(): _filter_jobs("CLASS_B"))
	parent.add_child(filter_b)

	var filter_c = _make_button("CLASS C", Vector2(270, 46), Vector2(85, 32))
	_style_btn(filter_c, Color(1.0, 0.15, 0.2))
	filter_c.pressed.connect(func(): _filter_jobs("CLASS_C"))
	parent.add_child(filter_c)

	var refresh_btn = _make_button("↻ REFRESH", Vector2(456, 46), Vector2(112, 32))
	_style_btn(refresh_btn, Color(0.95, 0.75, 0.15))
	refresh_btn.pressed.connect(_fetch_garage_data)
	parent.add_child(refresh_btn)

# ====================================================
# DETAIL PANEL PLACEHOLDER
# ====================================================
func _build_detail_placeholder(parent: Control) -> void:
	var lbl = Label.new()
	lbl.text = "◀  SELECT A CONTRACT\nTO VIEW RISK BREAKDOWN\nAND PAYOUT DETAILS"
	lbl.add_theme_font_size_override("font_size", 14)
	lbl.add_theme_color_override("font_color", Color(0.35, 0.25, 0.45, 1.0))
	lbl.position = Vector2(20, 200)
	lbl.size = Vector2(260, 120)
	lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.name = "PlaceholderLabel"
	parent.add_child(lbl)

# ====================================================
# DATA FETCHING
# ====================================================
func _fetch_garage_data() -> void:
	# Fetch real contraband jobs from server
	var http_req = HTTPRequest.new()
	add_child(http_req)
	http_req.request_completed.connect(_on_jobs_response.bind(http_req))
	http_req.request(
		BASE_URL + "/api/dispatch/contracts/contraband",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

	# Fetch latest garages/fleet state from server in parallel
	var garage_req = HTTPRequest.new()
	add_child(garage_req)
	garage_req.request_completed.connect(_on_garage_response.bind(garage_req))
	garage_req.request(
		BASE_URL + "/api/garage",
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _on_garage_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, garage_req: HTTPRequest) -> void:
	garage_req.queue_free()
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Dictionary:
			if data.has("garages") and data["garages"] is Array:
				GameState.garages = data["garages"]
			
			var merged_fleet: Array = []
			for g in GameState.garages:
				if g.has("trucks") and g["trucks"] is Array:
					for t in g["trucks"]:
						t["garageCity"] = g.get("city", "Unknown")
						merged_fleet.append(t)
			GameState.fleet = merged_fleet
			_populate_truck_selector()


func _on_jobs_response(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, http_req: HTTPRequest) -> void:
	http_req.queue_free()
	if code == 200:
		var data = JSON.parse_string(body.get_string_from_utf8())
		if data and data is Array and not data.is_empty():
			available_jobs = data
			_render_job_list(available_jobs)
			return
	# Fallback to synthetic if server empty or unreachable
	_generate_synthetic_jobs()

func _generate_synthetic_jobs() -> void:
	var rng = RandomNumberGenerator.new()
	rng.randomize()

	var origins = ["Minsk", "Brest", "Hrodna", "Daugavpils", "Kaliningrad"]
	var destinations = ["Riga", "Tallinn", "Warsaw", "Gdansk", "Vilnius", "Kaunas"]
	var classes = ["CLASS_A", "CLASS_A", "CLASS_B", "CLASS_B", "CLASS_C"]

	available_jobs = []
	var count = rng.randi_range(5, 9)
	for i in range(count):
		var cargo_class = classes[rng.randi() % classes.size()]
		var risk_mult = rng.randf_range(1.0, 5.0)
		var payout = 0.0
		match cargo_class:
			"CLASS_A": payout = rng.randf_range(8000.0, 25000.0)
			"CLASS_B": payout = rng.randf_range(30000.0, 80000.0)
			"CLASS_C": payout = rng.randf_range(100000.0, 350000.0)

		available_jobs.append({
			"id": "synthetic_%d" % i,
			"cargoClass": cargo_class,
			"riskMultiplier": snappedf(risk_mult, 0.1),
			"payoutBlack": snappedf(payout, 100.0),
			"origin": origins[rng.randi() % origins.size()],
			"destination": destinations[rng.randi() % destinations.size()],
			"distanceKm": rng.randi_range(180, 950),
			"description": _gen_cargo_description(cargo_class, rng),
		})

	_render_job_list(available_jobs)

func _gen_cargo_description(cargo_class: String, rng: RandomNumberGenerator) -> String:
	match cargo_class:
		"CLASS_A":
			var descs = [
				"24 pallets undeclared consumer electronics",
				"Unmanifested cigarette cartons (untaxed)",
				"Counterfeit designer goods — sealed crates",
				"Tax-evaded luxury watches",
			]
			return descs[rng.randi() % descs.size()]
		"CLASS_B":
			var descs = [
				"Precursor chemicals — restricted compound",
				"Unlicensed pharmaceutical batch",
				"Synthetic narcotics, vacuum sealed",
				"Controlled substances — lab-grade packaging",
			]
			return descs[rng.randi() % descs.size()]
		"CLASS_C":
			var descs = [
				"Military-grade hardware (no paperwork)",
				"Depleted uranium shielding components",
				"Unregistered ordnance — classified manifest",
				"Biological research samples — cold chain required",
			]
			return descs[rng.randi() % descs.size()]
	return "Unknown cargo"

func _populate_truck_selector() -> void:
	var ts = _find_node_recursive(scene_root, "TruckSelect")
	if not ts or not ts is OptionButton:
		return
	ts.clear()
	# Use GameState.fleet (populated by NetworkManager on garage fetch)
	var fleet = GameState.get("fleet") if GameState.has_method("get") else []
	if fleet == null or fleet.size() == 0:
		ts.add_item("No trucks — visit Garage first")
		return
	# Show standby, non-impounded trucks (even if they have no driver assigned)
	var dispatch_ready = fleet.filter(func(t): 
		return not t.get("isImpounded", false) \
			and t.get("activeRoute", null) == null
	)
	if dispatch_ready.is_empty():
		ts.add_item("No dispatch-ready trucks")
		return
	for truck in dispatch_ready:
		var d_name = "No Driver"
		var driver = truck.get("driver", null)
		if driver and driver is Dictionary:
			d_name = driver.get("name", "Unknown Driver")
		ts.add_item("%s  [Eng:%d%% Tire:%d%%] - %s" % [
			truck.get("model", "Unknown"),
			int(truck.get("engineHealth", 0)),
			int(truck.get("tireWear", 0)),
			d_name
		])
	player_trucks = dispatch_ready
	if not player_trucks.is_empty():
		if player_truck_id.is_empty():
			player_truck_id = player_trucks[0].get("id", "")
			if not selected_job.is_empty():
				_render_job_detail(selected_job)


func _find_node_recursive(node: Node, target_name: String) -> Node:
	if node.name == target_name:
		return node
	for child in node.get_children():
		var result = _find_node_recursive(child, target_name)
		if result:
			return result
	return null

# ====================================================
# RENDER JOB LISTINGS
# ====================================================
func _render_job_list(jobs: Array) -> void:
	var list = _find_node_recursive(scene_root, "ContractsList")
	if not list:
		return
	for child in list.get_children():
		child.queue_free()

	for job in jobs:
		var card = _make_job_card(job)
		list.add_child(card)

func _make_job_card(job: Dictionary) -> Control:
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(550, 90)
	_style_panel(card, _class_color(job.cargoClass))

	var hbox = HBoxContainer.new()
	hbox.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	card.add_child(hbox)

	# Class badge
	var badge = Label.new()
	badge.text = job.cargoClass.replace("CLASS_", "C")
	badge.add_theme_font_size_override("font_size", 24)
	badge.add_theme_color_override("font_color", _class_color(job.cargoClass))
	badge.custom_minimum_size = Vector2(48, 0)
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hbox.add_child(badge)

	var vbox = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hbox.add_child(vbox)

	var route_lbl = Label.new()
	route_lbl.text = "📍 %s  ►  %s   [%d km]" % [job.origin, job.destination, job.distanceKm]
	route_lbl.add_theme_font_size_override("font_size", 14)
	route_lbl.add_theme_color_override("font_color", Color(0.8, 0.8, 0.9, 1.0))
	vbox.add_child(route_lbl)

	var desc_lbl = Label.new()
	desc_lbl.text = job.description
	desc_lbl.add_theme_font_size_override("font_size", 13)
	desc_lbl.add_theme_color_override("font_color", Color(0.5, 0.45, 0.6, 1.0))
	vbox.add_child(desc_lbl)

	var payout_lbl = Label.new()
	payout_lbl.text = "💜 $%s BM   ⚠ Risk ×%.1f" % [
		_format_money(job.payoutBlack), job.riskMultiplier
	]
	payout_lbl.add_theme_font_size_override("font_size", 14)
	payout_lbl.add_theme_color_override("font_color", Color(0.8, 0.5, 1.0, 1.0))
	vbox.add_child(payout_lbl)

	# Select button
	var sel_btn = Button.new()
	sel_btn.text = "VIEW"
	sel_btn.custom_minimum_size = Vector2(80, 0)
	sel_btn.add_theme_font_size_override("font_size", 13)
	_style_btn(sel_btn, _class_color(job.cargoClass))
	sel_btn.pressed.connect(func(): _select_job(job))
	hbox.add_child(sel_btn)

	return card

# ====================================================
# JOB SELECTION — Populate detail panel
# ====================================================
func _select_job(job: Dictionary) -> void:
	selected_job = job
	_render_job_detail(job)

func _render_job_detail(job: Dictionary) -> void:
	var panel = _find_node_recursive(scene_root, "DetailPanel")
	if not panel:
		return

	for child in panel.get_children():
		child.queue_free()

	var title = Label.new()
	title.text = "CARGO ANALYSIS"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color(0.8, 0.5, 1.0, 1.0))
	title.position = Vector2(12, 10)
	panel.add_child(title)

	var class_lbl = Label.new()
	class_lbl.text = job.cargoClass.replace("_", " ") + "  —  Risk ×" + str(job.riskMultiplier)
	class_lbl.add_theme_font_size_override("font_size", 13)
	class_lbl.add_theme_color_override("font_color", _class_color(job.cargoClass))
	class_lbl.position = Vector2(12, 34)
	panel.add_child(class_lbl)

	var div = ColorRect.new()
	div.color = Color(0.65, 0.45, 1.0, 0.3)
	div.position = Vector2(12, 56)
	div.size = Vector2(276, 1)
	panel.add_child(div)

	# Route info (Key-Value single-line grid)
	var info_lines = [
		["ORIGIN", job.origin],
		["DESTINATION", job.destination],
		["DISTANCE", "%d km" % job.distanceKm],
		["CARGO", job.description],
		["PAYOUT (BM)", "$" + _format_money(job.payoutBlack)],
		["RISK MULTIPLIER", "×%.1f" % job.riskMultiplier],
	]

	var y_offset = 64
	for pair in info_lines:
		var key_lbl = Label.new()
		key_lbl.text = pair[0]
		key_lbl.add_theme_font_size_override("font_size", 12)
		key_lbl.add_theme_color_override("font_color", Color(0.5, 0.4, 0.6, 1.0))
		key_lbl.position = Vector2(12, y_offset)
		panel.add_child(key_lbl)

		var val_lbl = Label.new()
		val_lbl.text = pair[1]
		val_lbl.add_theme_font_size_override("font_size", 13)
		val_lbl.add_theme_color_override("font_color", Color(0.85, 0.8, 0.9, 1.0))
		val_lbl.position = Vector2(120, y_offset)
		val_lbl.size = Vector2(168, 40 if pair[0] == "CARGO" else 20)
		val_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		val_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		panel.add_child(val_lbl)
		
		if pair[0] == "CARGO":
			y_offset += 34
		else:
			y_offset += 24

	# Risk bar
	var risk_header = Label.new()
	risk_header.text = "ESTIMATED BORDER RISK"
	risk_header.add_theme_font_size_override("font_size", 12)
	risk_header.add_theme_color_override("font_color", Color(1.0, 0.5, 0.2, 1.0))
	risk_header.position = Vector2(12, y_offset)
	panel.add_child(risk_header)

	y_offset += 20
	var risk_pct = clamp(job.riskMultiplier / 5.0, 0.0, 1.0)
	
	# Risk bar background
	var risk_bg = PanelContainer.new()
	risk_bg.position = Vector2(12, y_offset)
	risk_bg.size = Vector2(276, 16)
	var sbg = StyleBoxFlat.new()
	sbg.bg_color = Color(0.04, 0.04, 0.06, 0.8)
	sbg.border_color = Color(1.0, 0.25, 0.25, 0.2)
	sbg.set_border_width_all(1)
	sbg.set_corner_radius_all(3)
	risk_bg.add_theme_stylebox_override("panel", sbg)
	panel.add_child(risk_bg)

	# Risk bar fill
	var risk_fill = PanelContainer.new()
	risk_fill.position = Vector2(12, y_offset)
	risk_fill.size = Vector2(276 * risk_pct, 16)
	var sfill = StyleBoxFlat.new()
	var r_color = Color(0.18, 0.803, 0.443) # Emerald Green
	if risk_pct > 0.6:
		r_color = Color(1.0, 0.25, 0.25) # Crimson
	elif risk_pct > 0.3:
		r_color = Color(1.0, 0.6, 0.1) # Orange
	sfill.bg_color = r_color
	sfill.set_corner_radius_all(3)
	risk_fill.add_theme_stylebox_override("panel", sfill)
	panel.add_child(risk_fill)

	y_offset += 26

	# Dispatch vehicle details row
	var selected_truck: Dictionary = {}
	for t in player_trucks:
		if t.get("id", "") == player_truck_id:
			selected_truck = t
			break

	var dispatch_header = Label.new()
	dispatch_header.text = "DISPATCH VEHICLE"
	dispatch_header.add_theme_font_size_override("font_size", 12)
	dispatch_header.add_theme_color_override("font_color", Color(0.65, 0.45, 1.0, 1.0))
	dispatch_header.position = Vector2(12, y_offset)
	panel.add_child(dispatch_header)

	y_offset += 18

	var truck_lbl = Label.new()
	if not selected_truck.is_empty():
		var d_name = "No Driver"
		var driver = selected_truck.get("driver", null)
		if driver and driver is Dictionary:
			d_name = driver.get("name", "Unknown Driver")
		truck_lbl.text = "🚚 %s\n👤 %s" % [selected_truck.get("model", "Unknown"), d_name]
		truck_lbl.add_theme_color_override("font_color", Color(0.85, 0.8, 1.0, 1.0))
	else:
		truck_lbl.text = "🚚 None Selected (Select in center panel)"
		truck_lbl.add_theme_color_override("font_color", Color(1.0, 0.25, 0.25, 1.0))
	
	truck_lbl.add_theme_font_size_override("font_size", 12)
	truck_lbl.position = Vector2(12, y_offset)
	truck_lbl.size = Vector2(276, 36)
	panel.add_child(truck_lbl)

	y_offset += 42

	# ACCEPT BUTTON
	var accept_btn = Button.new()
	accept_btn.text = "✔  ACCEPT CONTRACT"
	accept_btn.position = Vector2(12, y_offset)
	accept_btn.size = Vector2(276, 44)
	accept_btn.add_theme_font_size_override("font_size", 14)
	_style_btn(accept_btn, Color(0.18, 0.803, 0.443))
	accept_btn.pressed.connect(_accept_job)
	panel.add_child(accept_btn)

	y_offset += 52

	# DECLINE BUTTON
	var decline_btn = Button.new()
	decline_btn.text = "✕  DECLINE"
	decline_btn.position = Vector2(12, y_offset)
	decline_btn.size = Vector2(276, 32)
	decline_btn.add_theme_font_size_override("font_size", 13)
	_style_btn(decline_btn, Color(1.0, 0.25, 0.25))
	decline_btn.pressed.connect(func(): selected_job = {})
	panel.add_child(decline_btn)

# ====================================================
# JOB ACCEPTANCE
# ====================================================
func _accept_job() -> void:
	if selected_job.is_empty():
		_show_toast("No contract selected!")
		return
	if hire_http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		_show_toast("✕ Dispatch already in progress. Please wait...", Color(1.0, 0.3, 0.3, 1.0))
		return

	var ts = _find_node_recursive(scene_root, "TruckSelect")
	if ts and ts is OptionButton:
		if ts.get_item_count() == 0 or GameState.fleet.is_empty():
			_show_toast("⚠ No trucks available! Buy a truck first.")
			return
		var idx = ts.get_selected()
		if idx >= 0 and idx < player_trucks.size():
			player_truck_id = player_trucks[idx].get("id", "")


	if player_truck_id.is_empty():
		_show_toast("⚠ Select a truck for this contract!")
		return

	# POST to dispatch endpoint to assign the contraband job
	var token = GameState.auth_token
	var headers = ["Content-Type: application/json", "Authorization: Bearer " + token]
	var body = JSON.stringify({
		"truckId": player_truck_id,
		"jobId": selected_job.id,
		"origin": selected_job.origin,
		"destination": selected_job.destination,
		"cargoClass": selected_job.cargoClass,
		"payoutBlack": selected_job.payoutBlack,
		"riskMultiplier": selected_job.riskMultiplier,
	})

	hire_http.request(
		BASE_URL + "/api/dispatch/launch",
		["Content-Type: application/json", "Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_POST,
		body
	)
	_show_toast("📨 Sending contract papers...")

func _on_accept_response(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code == 200 or response_code == 201:
		_show_toast("✔ CONTRACT ACCEPTED — Truck dispatched!", Color(0.2, 1.0, 0.4, 1.0))
		selected_job = {}
		_fetch_garage_data() # Refresh from real API
	else:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		var err_msg = parsed.get("message", parsed.get("error", "UNKNOWN")) if parsed else "PARSE_ERROR"
		_show_toast("✕ Failed: " + err_msg, Color(1.0, 0.3, 0.3, 1.0))

# ====================================================
# FILTERING
# ====================================================
func _filter_jobs(cargo_class: String) -> void:
	if cargo_class == "ALL":
		_render_job_list(available_jobs)
	else:
		var filtered = available_jobs.filter(func(j): return j.cargoClass == cargo_class)
		_render_job_list(filtered)

# ====================================================
# EVENT HANDLERS
# ====================================================
func _on_truck_selected(idx: int) -> void:
	if idx >= 0 and idx < player_trucks.size():
		player_truck_id = player_trucks[idx].get("id", "")
		if not selected_job.is_empty():
			_render_job_detail(selected_job)


func _go_back() -> void:
	SceneTransition.change_scene_to_file("res://scenes/game_map/GameMap.tscn")

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
	_style_panel(p, Color(0.65, 0.45, 1.0))
	
	control.add_child(p)
	return control

func _make_button(label_text: String, pos: Vector2, sz: Vector2) -> Button:
	var btn = Button.new()
	btn.text = label_text
	btn.position = pos
	btn.size = sz
	btn.add_theme_font_size_override("font_size", 13)
	_style_btn(btn, Color(0.65, 0.45, 1.0))
	return btn

func _show_toast(msg: String, color: Color = Color(1.0, 0.8, 0.2, 1.0)) -> void:
	var toast = Label.new()
	toast.text = msg
	toast.add_theme_font_size_override("font_size", 14)
	toast.add_theme_color_override("font_color", color)
	toast.position = Vector2(400, 640)
	toast.size = Vector2(480, 30)
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	scene_root.add_child(toast)
	var tween = create_tween()
	tween.tween_property(toast, "modulate:a", 0.0, 2.5)
	tween.tween_callback(toast.queue_free)

func _class_color(cargo_class: String) -> Color:
	match cargo_class:
		"CLASS_A": return Color(0.2, 0.9, 0.5, 1.0)
		"CLASS_B": return Color(1.0, 0.6, 0.1, 1.0)
		"CLASS_C": return Color(1.0, 0.15, 0.2, 1.0)
	return Color(0.6, 0.6, 0.7, 1.0)

func _heat_color(heat: int) -> Color:
	if heat >= 70: return Color(1.0, 0.1, 0.1, 1.0)
	if heat >= 40: return Color(1.0, 0.6, 0.1, 1.0)
	return Color(0.3, 1.0, 0.5, 1.0)

func _format_money(amount: float) -> String:
	if amount >= 1000000.0:
		return "%.1fM" % (amount / 1000000.0)
	if amount >= 1000.0:
		return "%.1fK" % (amount / 1000.0)
	return str(int(amount))

func _style_panel(panel: PanelContainer, accent_col: Color) -> void:
	GlobalThemeManager.apply_glass(panel, "underworld")

func _style_btn(btn: Button, accent_col: Color, is_selected: bool = false) -> void:
	GlobalThemeManager.apply_btn_style(btn, accent_col)

extends Control

# UI References
@onready var player_name_lbl: Label = %PlayerName
@onready var legal_balance_lbl: Label = %LegalBalance
@onready var black_balance_lbl: Label = %BlackBalance
@onready var rep_val_lbl: Label = %RepVal
@onready var heat_val_lbl: Label = %HeatVal
@onready var city_name_lbl: Label = %CityName
@onready var schengen_val_lbl: Label = %SchengenVal
@onready var connection_list_box: VBoxContainer = %ConnectionList
@onready var console_lbl: Label = %ConsoleLabel
@onready var back_menu_btn: Button = %BackMenuBtn
@onready var garage_btn: Button = %GarageBtn
@onready var dispatch_btn: Button = %DispatchBtn
@onready var auction_btn: Button = %AuctionBtn
@onready var laundry_btn: Button = %LaundryBtn
@onready var underworld_btn: Button = %UnderworldBtn
@onready var analytics_btn: Button = %AnalyticsBtn
@onready var support_btn: Button = %SupportBtn
@onready var staff_btn: Button = %StaffBtn

# Concurrent HUD overlays & dropdowns
@onready var garage_dropdown: PanelContainer = %GarageDropdown
@onready var support_dropdown: PanelContainer = %SupportDropdown
@onready var garage_manager_btn: Button = %GarageManagerBtn
@onready var parts_shop_btn: Button = %PartsShopBtn
@onready var emergency_recovery_btn: Button = %EmergencyRecoveryBtn
@onready var factory_showroom_btn: Button = %FactoryShowroomBtn
@onready var rd_tech_tree_btn: Button = %RDTechTreeBtn
@onready var surcharge_warning: PanelContainer = %SurchargeWarning
@onready var route_info_panel: PanelContainer = %RouteInfoPanel

# Interactive Shader Calibration & System Preset Controls
@onready var close_support_btn: Button = get_node_or_null("%CloseSupportBtn")
@onready var vignette_slider: HSlider = get_node_or_null("%VignetteSlider")
@onready var scanline_slider: HSlider = get_node_or_null("%ScanlineSlider")
@onready var curvature_slider: HSlider = get_node_or_null("%CurvatureSlider")
@onready var density_slider: HSlider = get_node_or_null("%DensitySlider")
@onready var vignette_val_lbl: Label = get_node_or_null("%VignetteValue")
@onready var scanline_val_lbl: Label = get_node_or_null("%ScanlineValue")
@onready var curvature_val_lbl: Label = get_node_or_null("%CurvatureValue")
@onready var density_val_lbl: Label = get_node_or_null("%DensityValue")
@onready var quality_preset_btn: Button = get_node_or_null("%QualityPresetBtn")
@onready var shader_overlay: ColorRect = $ShaderOverlayLayer/ShaderOverlay if has_node("ShaderOverlayLayer/ShaderOverlay") else null

var clock_lbl: Label = null


# Camera Pan & Zoom controls
@onready var camera: Camera2D = $MapContainer/ViewportWrapper/Camera if has_node("MapContainer/ViewportWrapper/Camera") else %Camera
@onready var map_drawer: Node2D = $MapContainer/ViewportWrapper/VectorMapDrawer if has_node("MapContainer/ViewportWrapper/VectorMapDrawer") else %VectorMapDrawer
@onready var map_container: Control = $MapContainer if has_node("MapContainer") else %MapContainer
@onready var console_box: PanelContainer = %ConsoleBox

var is_dragging: bool = false
var drag_start: Vector2 = Vector2.ZERO
var zoom_level: float = 1.0 # Start zoomed-out to showcase the entire theater
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0

# Map rendering calculations
var cities_data: Dictionary = {}
var rendered_nodes: Dictionary = {} # city_id -> Vector2 (scaled screen coords)
var hovered_city_id: String = ""
var selected_city_id: String = ""

# Map Projection Scales
var map_min_lat: float = 20.0
var map_max_lat: float = 65.0
var map_min_lon: float = -8.0
var map_max_lon: float = 72.0
const MAP_MARGIN = 150 # screen offset bounds
var view_size = Vector2(2500, 1600) # Massive virtual tactical canvas for high-density rendering
var view_offset = Vector2(0, 0) # Unrestrict canvas coordinates to full resolution

var time_passed: float = 0.0

# Geographic Border & Coastline Data
# Format: Array of points (Vector2(lat, lon))
var coastlines: Array = [
	# === NORTH SEA / ENGLISH CHANNEL / ATLANTIC ===
	[
		Vector2(51.9, 4.1),    # Rotterdam
		Vector2(51.45, 3.5),   # Zeeland
		Vector2(51.1, 2.5),    # Belgian coast
		Vector2(50.9, 1.8),    # Dunkirk
		Vector2(50.95, 1.6),   # Calais
		Vector2(51.1, 1.3),    # Cap Gris-Nez
		Vector2(51.3, 1.0),    # Margate
		Vector2(51.5, 0.5),    # Thames Estuary
		Vector2(51.5, 0.1),    # London (Thames)
		Vector2(51.3, -0.2),   # South London suburbs
		Vector2(50.85, -0.15), # Brighton
		Vector2(50.7, -1.1),   # Portsmouth
		Vector2(50.6, -2.5),   # Dorset
		Vector2(50.35, -3.5),  # Devon
		Vector2(50.1, -5.5),   # Cornwall tip
		Vector2(51.0, -5.2),   # North Devon
		Vector2(51.7, -5.0),   # Pembrokeshire
		Vector2(52.8, -4.7),   # Barmouth
		Vector2(53.3, -4.6),   # Anglesey
		Vector2(53.7, -3.0),   # Blackpool
		Vector2(54.0, -2.0),   # Lancaster
		Vector2(54.6, -1.4),   # Hartlepool
		Vector2(55.0, -1.6),   # Newcastle
		Vector2(55.9, -2.1),   # Berwick
		Vector2(56.4, -2.4),   # Dundee
		Vector2(57.7, -2.5),   # Aberdeen
		Vector2(58.6, -3.2),   # Caithness
	],
	# === NETHERLANDS / BELGIUM / FRANCE ATLANTIC ===
	[
		Vector2(53.5, 7.2),    # North Sea German-Dutch border
		Vector2(53.2, 6.5),    # Groningen coast
		Vector2(52.9, 5.7),    # Friesland
		Vector2(52.7, 5.1),    # Ijsselmeer
		Vector2(52.5, 4.6),    # North Holland
		Vector2(52.1, 4.3),    # The Hague
		Vector2(51.9, 4.1),    # Rotterdam
		Vector2(51.1, 2.5),    # Belgian coast
		Vector2(50.9, 1.8),    # Dunkirk
		Vector2(50.5, 1.5),    # Cap de la Heve
		Vector2(49.5, -0.2),   # Normandy
		Vector2(48.7, -1.8),   # Brittany
		Vector2(48.0, -4.5),   # Brest tip
		Vector2(47.3, -2.5),   # Loire Atlantique
		Vector2(46.2, -1.5),   # Charente-Maritime
		Vector2(45.5, -1.2),   # Gironde
		Vector2(44.3, -1.4),   # Basque-Landes
		Vector2(43.4, -1.8),   # Pays Basque
	],
	# === IBERIAN (simplified) ===
	[
		Vector2(43.4, -1.8),   # Pays Basque / Spain border
		Vector2(43.6, -2.5),   # Asturias
		Vector2(43.7, -7.5),   # Galicia
		Vector2(42.0, -8.8),   # Vigo
		Vector2(38.8, -9.5),   # Lisbon
		Vector2(37.0, -8.9),   # Algarve
		Vector2(36.0, -5.4),   # Gibraltar
		Vector2(36.5, -2.0),   # Almeria
		Vector2(37.5, 0.2),    # Alicante
		Vector2(39.5, 3.3),    # Balearics / Valencia
		Vector2(41.4, 2.2),    # Barcelona
		Vector2(42.4, 3.2),    # Costa Brava
		Vector2(43.4, 4.0),    # Gulf du Lion
		Vector2(43.2, 5.3),    # Marseille
	],
	# === MEDITERRANEAN FRANCE / ITALY WEST ===
	[
		Vector2(43.2, 5.3),    # Marseille
		Vector2(43.5, 6.8),    # Nice
		Vector2(43.75, 7.4),   # Monaco
		Vector2(44.1, 8.1),    # Genoa
		Vector2(43.8, 9.8),    # Cinque Terre
		Vector2(43.5, 10.3),   # Livorno
		Vector2(42.6, 10.9),   # Tuscany
		Vector2(41.8, 12.3),   # Tiber mouth / Rome
		Vector2(41.0, 13.4),   # Gaeta
		Vector2(40.0, 15.0),   # Gulf of Policastro
		Vector2(38.0, 15.5),   # Calabria tip / Strait of Messina
		Vector2(37.5, 15.1),   # Sicily NE
		Vector2(37.5, 12.5),   # Sicily south
		Vector2(37.9, 13.3),   # Sicily west / Palermo
	],
	# === ITALY ADRIATIC ===
	[
		Vector2(38.0, 15.5),   # Calabria
		Vector2(39.8, 15.8),   # Basilicata
		Vector2(41.3, 15.9),   # Foggia
		Vector2(41.9, 15.5),   # Gargano Promontory
		Vector2(43.5, 13.5),   # Ancona
		Vector2(44.4, 12.2),   # Rimini
		Vector2(45.5, 13.0),   # Trieste
		Vector2(45.3, 13.6),   # Istrian coast
	],
	# === CROATIA / BALKANS ADRIATIC ===
	[
		Vector2(45.3, 13.6),   # Istrian coast
		Vector2(44.2, 14.5),   # Zadar
		Vector2(43.5, 16.5),   # Split
		Vector2(42.7, 17.5),   # Dubrovnik
		Vector2(42.3, 18.5),   # Montenegro
		Vector2(41.3, 19.5),   # Albania
		Vector2(40.6, 19.7),   # Vlore
		Vector2(39.6, 20.0),   # Ionian coast
	],
	# === GREECE / AEGEAN ===
	[
		Vector2(39.6, 20.0),   # Ionian
		Vector2(38.9, 20.8),   # Lefkada
		Vector2(37.7, 21.0),   # Peloponnese W
		Vector2(36.9, 21.7),   # Cape Matapan
		Vector2(37.1, 22.5),   # Laconia
		Vector2(37.6, 23.0),   # Argolis
		Vector2(37.9, 23.7),   # Athens / Piraeus
		Vector2(38.4, 24.0),   # Evia S
		Vector2(39.1, 23.0),   # Thessaly coast
		Vector2(39.5, 22.8),   # Volos
		Vector2(40.0, 22.5),   # Pieria
		Vector2(40.5, 22.8),   # Thessaloniki
		Vector2(40.9, 24.8),   # Kavala
		Vector2(41.3, 26.3),   # Alexandroupolis / Turkish border
	],
	# === BLACK SEA (EUROPEAN COAST) ===
	[
		Vector2(41.3, 26.3),   # Alexandroupolis
		Vector2(41.0, 27.0),   # Thrace
		Vector2(41.1, 28.0),   # Istanbul Bosphorus W
		Vector2(41.0, 29.1),   # Istanbul Bosphorus E
		Vector2(41.2, 30.5),   # Sakarya
		Vector2(41.6, 32.0),   # Sinop coast
		Vector2(41.3, 33.5),   # Kastamonu coast
		Vector2(41.0, 36.0),   # Samsun
		Vector2(41.1, 38.5),   # Trabzon
		Vector2(41.5, 41.5),   # Rize
	],
	# === BLACK SEA (UKRAINE/RUSSIA NORTH COAST) ===
	[
		Vector2(46.5, 30.7),   # Odessa
		Vector2(46.2, 31.8),   # Ochakiv
		Vector2(46.3, 33.0),   # Kherson
		Vector2(45.8, 33.5),   # Crimea NW
		Vector2(44.5, 33.5),   # Sevastopol
		Vector2(44.9, 34.8),   # Yalta
		Vector2(44.9, 36.5),   # Kerch Strait W
		Vector2(45.3, 36.8),   # Kerch Strait
		Vector2(46.0, 37.5),   # Azov coast
	],
	# === ROMANIA / MOLDOVA (Danube mouth) ===
	[
		Vector2(45.2, 29.8),   # Danube delta N
		Vector2(44.9, 29.6),   # Danube delta S
		Vector2(44.2, 28.7),   # Constanta
		Vector2(43.8, 28.5),   # Bulgaria Black Sea
		Vector2(43.2, 28.0),   # Varna
		Vector2(42.5, 27.5),   # Burgas
		Vector2(41.9, 27.8),   # Turkey border / Tekirdag
		Vector2(41.3, 26.3),   # Alexandroupolis
	],
	# === SCANDINAVIA (Norway/Sweden west coast) ===
	[
		Vector2(57.7, 8.0),    # Stavanger area
		Vector2(58.5, 5.7),    # Stavanger fjord
		Vector2(59.1, 5.3),    # Rogaland
		Vector2(60.3, 5.1),    # Bergen
		Vector2(61.0, 4.7),    # Sognefjord
		Vector2(62.5, 6.0),    # Alesund
		Vector2(63.5, 8.0),    # Trondheim fjord
		Vector2(65.0, 14.0),   # Bodo area
	],
	# === SCANDINAVIA (Sweden / Denmark east) ===
	[
		Vector2(56.0, 10.6),   # Jutland E
		Vector2(56.5, 10.3),   # Jutland N
		Vector2(57.7, 9.5),    # Skagen
		Vector2(58.5, 9.5),    # Norway south
		Vector2(59.3, 10.6),   # Oslo fjord
		Vector2(59.0, 11.0),   # Swedish border
		Vector2(58.5, 11.1),   # Gothenburg N
		Vector2(57.7, 12.0),   # Gothenburg
		Vector2(56.2, 12.5),   # Helsingborg
		Vector2(55.6, 13.0),   # Malmoe
		Vector2(55.4, 14.5),   # Bornholm strait
		Vector2(55.1, 15.1),   # S. Sweden
		Vector2(56.5, 16.5),   # Kalmar
		Vector2(57.5, 18.3),   # Gotland W
		Vector2(58.5, 17.5),   # Nykoping
		Vector2(59.3, 18.1),   # Stockholm
		Vector2(60.3, 18.5),   # Uppsala coast
		Vector2(60.5, 17.7),   # Gavle
	],
	# === BALTIC SEA: FINLAND & GULF OF FINLAND ===
	[
		Vector2(59.45, 27.559),
		Vector2(59.48, 27.0),
		Vector2(59.55, 26.5),
		Vector2(59.6, 25.8),
		Vector2(59.52, 25.3),
		Vector2(59.46, 24.75),  # Tallinn near here
		Vector2(59.35, 24.1),
		Vector2(59.20, 23.4),
		Vector2(59.45, 22.8),  # Turu/Turku
		Vector2(60.1, 22.0),
		Vector2(60.2, 21.0),
		Vector2(60.8, 21.3),
		Vector2(61.1, 21.4),   # Pori
		Vector2(61.4, 21.5),   # Rauma
		Vector2(61.9, 21.3),
		Vector2(62.5, 21.5),
		Vector2(63.3, 21.5),
		Vector2(63.7, 22.8),
		Vector2(64.0, 24.5),   # Oulu
		Vector2(65.0, 25.0),
	],
	# === LATVIA COAST ===
	[
		Vector2(58.38, 24.4),  # Pärnu
		Vector2(57.8, 24.3),   # Ainaži
		Vector2(57.2, 24.4),   # Saulkrasti
		Vector2(57.0, 24.1),   # Riga
		Vector2(57.0, 23.5),   # Jurmala
		Vector2(57.75, 22.6),  # Cape Kolka
		Vector2(57.4, 21.5),   # Ventspils
		Vector2(56.5, 21.0),   # Liepaja
		Vector2(55.7, 21.1),   # Klaipeda area
	],
	# === POLAND COAST / GDANSK ===
	[
		Vector2(55.7, 21.1),   # Klaipeda
		Vector2(55.2, 21.0),   # Kaliningrad border W
		Vector2(54.7, 19.9),   # Kaliningrad coast
		Vector2(54.4, 19.6),   # Braniewo area
		Vector2(54.35, 18.65), # Gdansk
		Vector2(54.5, 18.0),   # Gdynia
		Vector2(54.7, 17.5),   # Leba
		Vector2(54.6, 16.0),   # Slupsk
		Vector2(54.3, 14.5),   # Kolobrzeg
		Vector2(53.9, 14.2),   # Szczecin mouth
		Vector2(54.2, 13.9),   # Rugen
		Vector2(54.5, 13.5),   # Rugen
		Vector2(54.35, 12.0),  # Rostock
		Vector2(54.0, 10.9),   # Lubeck Bay
		Vector2(54.5, 10.2),   # Kiel
		Vector2(55.0, 9.9),    # Flensburg
		Vector2(56.0, 10.2),   # Jutland E
	],
	# === TURKEY (AEGEAN + SOUTH) ===
	[
		Vector2(41.5, 26.3),   # Turkey NW border
		Vector2(40.9, 26.5),   # Edirne coast
		Vector2(40.4, 26.7),   # Dardanelles N
		Vector2(40.1, 27.0),   # Dardanelles exit
		Vector2(39.5, 26.6),   # Izmir N coast
		Vector2(38.4, 26.7),   # Izmir
		Vector2(37.5, 27.3),   # Bodrum
		Vector2(36.5, 28.0),   # Marmaris
		Vector2(36.2, 29.6),   # Kas
		Vector2(36.2, 31.2),   # Alanya
		Vector2(36.5, 32.8),   # Silifke
		Vector2(36.8, 35.0),   # Iskenderun
		Vector2(36.6, 36.2),   # Turkish-Syrian border
	],
	# === MEDITERRANEAN EAST (Syria / Lebanon / Israel) ===
	[
		Vector2(36.6, 36.2),   # Turkish-Syrian border
		Vector2(35.5, 35.8),   # Latakia
		Vector2(34.5, 35.9),   # Tripoli Lebanon
		Vector2(33.9, 35.5),   # Beirut
		Vector2(33.0, 35.1),   # Haifa
		Vector2(31.9, 34.7),   # Tel Aviv
		Vector2(31.2, 34.3),   # Gaza
		Vector2(31.0, 32.5),   # Port Said
		Vector2(30.5, 32.3),   # Suez Canal entrance
	],
	# === RED SEA ENTRANCE / ARABIAN GULF (simplified) ===
	[
		Vector2(27.0, 49.5),   # Saudi Gulf Coast
		Vector2(26.0, 50.6),   # Bahrain area
		Vector2(25.3, 51.5),   # Qatar
		Vector2(25.2, 55.3),   # Dubai / Abu Dhabi
		Vector2(24.0, 57.0),   # Oman border
	],
]

var borders: Array = [
	# --- SCHENGEN BORDERS (Schengen) ---
	{
		"is_schengen": true,
		"points": [
			Vector2(57.87, 24.35), # Estonia-Latvia Coast
			Vector2(57.9, 25.2),
			Vector2(57.64, 25.8),  # Valga/Valka
			Vector2(57.52, 26.6),
			Vector2(57.5, 27.4)    # Russia triple point
		]
	},
	{
		"is_schengen": true,
		"points": [
			Vector2(56.07, 21.1),  # Latvia-Lithuania Coast
			Vector2(56.3, 22.0),
			Vector2(56.38, 23.0),
			Vector2(56.2, 24.4),
			Vector2(56.0, 25.5),
			Vector2(55.75, 26.2),
			Vector2(55.68, 26.63)  # Belarus triple point
		]
	},
	{
		"is_schengen": true,
		"points": [
			Vector2(54.36, 22.79), # Lithuania-Poland-Kaliningrad triple point
			Vector2(54.15, 23.2),
			Vector2(53.95, 23.52)  # Lithuania-Poland-Belarus triple point
		]
	},
	{
		"is_schengen": true,
		"points": [
			Vector2(53.95, 14.22), # Germany-Poland border coast (Baltic)
			Vector2(53.20, 14.35),
			Vector2(52.50, 14.62), # Frankfurt an der Oder
			Vector2(51.50, 14.75),
			Vector2(50.85, 14.85)  # Czech triple point limit
		]
	},
	
	# --- EXTERNAL NON-SCHENGEN BORDERS (Orange warning) ---
	{
		"is_schengen": false,
		"points": [
			Vector2(53.95, 23.52), # Poland-Lithuania-Belarus triple point
			Vector2(53.6, 23.6),
			Vector2(53.2, 23.9),   # East of Bialystok
			Vector2(52.7, 23.6),
			Vector2(52.1, 23.5),   # West/South of Brest
			Vector2(52.0, 23.5)
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(53.95, 23.52), # Poland-Lithuania-Belarus triple point
			Vector2(54.2, 24.3),
			Vector2(54.5, 25.1),   # Close to Vilnius
			Vector2(54.8, 25.8),
			Vector2(55.2, 26.4),
			Vector2(55.68, 26.63)  # Belarus-Lithuania-Latvia triple point
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(55.68, 26.63), # Belarus-Lithuania-Latvia triple point
			Vector2(55.8, 27.2),
			Vector2(55.9, 27.559)  # East border
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(59.45, 27.559), # Russia-Estonia Narva river
			Vector2(59.0, 27.4),   # Lake Peipus
			Vector2(58.0, 27.5),
			Vector2(57.5, 27.4)    # Estonia-Latvia-Russia triple point
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(57.5, 27.4),   # Estonia-Latvia-Russia triple point
			Vector2(56.8, 27.7),
			Vector2(55.9, 27.559)  # East border
		]
	},
	# Kaliningrad Borders
	{
		"is_schengen": false,
		"points": [
			Vector2(55.2, 21.0122), # Kaliningrad-Lithuania coast
			Vector2(55.1, 21.8),
			Vector2(55.0, 22.5),
			Vector2(54.36, 22.79)  # Kaliningrad-Lithuania-Poland triple point
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(54.36, 22.79), # Kaliningrad-Lithuania-Poland triple point
			Vector2(54.38, 21.8),
			Vector2(54.4, 21.0122) # Kaliningrad-Poland coast (west boundary)
		]
	},
	# Ukraine external borders
	{
		"is_schengen": false,
		"points": [
			Vector2(51.50, 23.62), # Poland-Belarus-Ukraine triple point
			Vector2(50.80, 24.05),
			Vector2(50.15, 24.15),
			Vector2(49.45, 22.80),
			Vector2(49.00, 22.50)  # Poland-Slovakia-Ukraine triple point limit
		]
	},
	{
		"is_schengen": false,
		"points": [
			Vector2(51.50, 23.62), # Poland-Belarus-Ukraine triple point
			Vector2(51.52, 25.10),
			Vector2(51.65, 26.80),
			Vector2(51.50, 28.30),
			Vector2(51.35, 30.2219), # Belarus-Ukraine border near Chernobyl
			Vector2(51.80, 31.10),
			Vector2(52.12, 32.25)  # Belarus-Ukraine-Russia triple point
		]
	},
	# Finland external border (Russia)
	{
		"is_schengen": false,
		"points": [
			Vector2(60.18, 27.50), # Gulf of Finland coast
			Vector2(60.60, 28.20),
			Vector2(61.10, 28.85),
			Vector2(61.50, 29.50)  # Northern map limit
		]
	}
]

func _ready() -> void:
	_setup_world_events()
	var side_panel = get_node_or_null("HUD/SidePanel")
	if side_panel:
		side_panel.visible = false
	
	var phone = SmartphoneHUD.new()
	phone.name = "SmartphoneHUD"
	add_child(phone)
	
	var toggle_btn = Button.new()
	toggle_btn.text = "📱 OPEN iDROID"
	toggle_btn.custom_minimum_size = Vector2(200, 48)
	toggle_btn.add_theme_font_size_override("font_size", 14)
	toggle_btn.add_theme_color_override("font_color", Color(0.2, 0.9, 0.7))
	toggle_btn.position = Vector2(1060, 650)
	
	var btn_st = StyleBoxFlat.new()
	btn_st.bg_color = Color(0.05, 0.05, 0.05, 0.9)
	btn_st.border_color = Color(0.2, 0.9, 0.7, 0.5)
	btn_st.border_width_left = 2
	btn_st.border_width_right = 2
	btn_st.border_width_top = 2
	btn_st.border_width_bottom = 2
	btn_st.set_corner_radius_all(12)
	toggle_btn.add_theme_stylebox_override("normal", btn_st)
	toggle_btn.add_theme_stylebox_override("hover", btn_st)
	
	toggle_btn.pressed.connect(phone.toggle_phone)
	add_child(toggle_btn)

	# Set up visual telemetry theme overrides
	_apply_hud_theme()
	
	clock_lbl = Label.new()
	clock_lbl.name = "ClockLabel"
	clock_lbl.add_theme_font_size_override("font_size", 14)
	clock_lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0, 1.0)) # Pure White Date
	if player_name_lbl and is_instance_valid(player_name_lbl) and player_name_lbl.get_parent():
		# Add a small visual spacer container inside HBox for perfect alignment
		var spacer = Control.new()
		spacer.custom_minimum_size = Vector2(24, 0)
		player_name_lbl.get_parent().add_child(spacer)
		player_name_lbl.get_parent().add_child(clock_lbl)

	
	# Load and project the Baltic route network
	_load_map_data()
	
	# Sync initial GameState telemetry values
	_sync_hud_data()
	
	# Signal listeners
	GameState.balance_updated.connect(_on_balances_updated)
	GameState.reputation_updated.connect(_on_reputation_updated)
	NetworkManager.connection_status_changed.connect(_on_network_status_changed)
	
	# Network signals for active routes telemetry
	NetworkManager.route_progress_updated.connect(func(_data): map_drawer.queue_redraw())
	NetworkManager.route_completed.connect(func(_data): _fetch_active_routes())
	NetworkManager.driver_snitched.connect(func(_data): _fetch_active_routes())
	NetworkManager.engine_breakdown.connect(func(_data): _fetch_active_routes())
	NetworkManager.driver_wreck.connect(func(_data): _fetch_active_routes())
	
	# Fetch initial active routes list
	_fetch_active_routes()
	
	back_menu_btn.pressed.connect(_on_back_pressed)
	dispatch_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/dispatch/DispatchCenter.tscn"))
	auction_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/auction/AuctionHouse.tscn"))
	laundry_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/laundry/LaundryFronts.tscn"))
	underworld_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/underworld/UnderworldDealer.tscn"))
	analytics_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/analytics/LogisticsAnalytics.tscn"))
	staff_btn.pressed.connect(func(): SceneTransition.change_scene_to_file("res://scenes/staff/StaffManager.tscn"))
	
	# Concurrent HUD overlays & custom dropdown toggling (hidden initially for a clean map view)
	garage_dropdown.visible = false
	support_dropdown.visible = false
	
	garage_btn.pressed.connect(func():
		garage_dropdown.visible = not garage_dropdown.visible
		if garage_dropdown.visible:
			support_dropdown.visible = false # hide the other to prevent clutter
	)
	
	support_btn.pressed.connect(func():
		support_dropdown.visible = not support_dropdown.visible
		if support_dropdown.visible:
			garage_dropdown.visible = false # hide the other to prevent clutter
	)
	
	# Wire up Interactive Shader Sliders & Graphics Calibration
	if is_instance_valid(shader_overlay) and shader_overlay.material is ShaderMaterial:
		var mat = shader_overlay.material as ShaderMaterial
		
		# Read starting states
		var vig_val = mat.get_shader_parameter("vignette_intensity")
		if vig_val == null:
			vig_val = 1.2
		if vignette_slider:
			vignette_slider.value = vig_val
		if vignette_val_lbl:
			vignette_val_lbl.text = "%.2f" % vig_val
			
		var scan_val = mat.get_shader_parameter("scanline_alpha")
		if scan_val == null:
			scan_val = 0.35
		if scanline_slider:
			scanline_slider.value = scan_val
		if scanline_val_lbl:
			scanline_val_lbl.text = "%.2f" % scan_val
			
		var curv_val = mat.get_shader_parameter("curvature")
		if curv_val == null:
			curv_val = 6.0
		if curvature_slider:
			curvature_slider.value = curv_val
		if curvature_val_lbl:
			curvature_val_lbl.text = "%.1f" % curv_val
			
		var dens_val = mat.get_shader_parameter("scanline_count")
		if dens_val == null:
			dens_val = 360.0
		if density_slider:
			density_slider.value = dens_val
		if density_val_lbl:
			density_val_lbl.text = "%d px" % int(dens_val)
			
		# Slider change connections
		if vignette_slider:
			vignette_slider.value_changed.connect(func(val):
				mat.set_shader_parameter("vignette_intensity", val)
				if vignette_val_lbl:
					vignette_val_lbl.text = "%.2f" % val
			)
			
		if scanline_slider:
			scanline_slider.value_changed.connect(func(val):
				mat.set_shader_parameter("scanline_alpha", val)
				if scanline_val_lbl:
					scanline_val_lbl.text = "%.2f" % val
			)
			
		if curvature_slider:
			curvature_slider.value_changed.connect(func(val):
				mat.set_shader_parameter("curvature", val)
				if curvature_val_lbl:
					curvature_val_lbl.text = "%.1f" % val
			)
			
		if density_slider:
			density_slider.value_changed.connect(func(val):
				mat.set_shader_parameter("scanline_count", val)
				if density_val_lbl:
					density_val_lbl.text = "%d px" % int(val)
			)
			
		# Preset buttons
		if quality_preset_btn:
			quality_preset_btn.text = GameState.graphics_quality
			quality_preset_btn.pressed.connect(func():
				if GameState.graphics_quality == "STANDARD":
					GameState.set_graphics_quality("ULTRA_HD")
					quality_preset_btn.text = "ULTRA_HD"
					if vignette_slider: vignette_slider.value = 1.4
					if scanline_slider: scanline_slider.value = 0.5
					if curvature_slider: curvature_slider.value = 4.5
					if density_slider: density_slider.value = 480.0
				else:
					GameState.set_graphics_quality("STANDARD")
					quality_preset_btn.text = "STANDARD"
					if vignette_slider: vignette_slider.value = 1.2
					if scanline_slider: scanline_slider.value = 0.35
					if curvature_slider: curvature_slider.value = 6.0
					if density_slider: density_slider.value = 360.0
			)
			
	if close_support_btn:
		close_support_btn.pressed.connect(func():
			support_dropdown.visible = false
		)
	
	# Sub-button connections
	garage_manager_btn.pressed.connect(func():
		SceneTransition.change_scene_to_file("res://scenes/garage/GarageManager.tscn")
	)
	parts_shop_btn.pressed.connect(func():
		SceneTransition.change_scene_to_file("res://scenes/shop/PartsShop.tscn")
	)
	emergency_recovery_btn.pressed.connect(func():
		SceneTransition.change_scene_to_file("res://scenes/breakdown/BreakdownPanel.tscn")
	)
	factory_showroom_btn.pressed.connect(func():
		SceneTransition.change_scene_to_file("res://scenes/dealership/Showroom.tscn")
	)
	rd_tech_tree_btn.pressed.connect(func():
		SceneTransition.change_scene_to_file("res://scenes/research/TechTree.tscn")
	)
	

	# Instruct map drawer to implement our custom vector _draw call
	print("[DEBUG] Connecting _draw_vector_map to map_drawer.draw. map_drawer: ", map_drawer, " camera: ", camera)
	map_drawer.draw.connect(_draw_vector_map)
	print("[DEBUG] Connection done. map_drawer is_visible_in_tree: ", map_drawer.is_visible_in_tree() if is_instance_valid(map_drawer) else "null")
	
	if camera and is_instance_valid(camera):
		camera.zoom = Vector2(zoom_level, zoom_level)
		print("[DEBUG] Camera zoom initialized to: ", camera.zoom)
	
	set_process_input(true)



# ==========================================
# MAP PROJECTION ENGINE
# ==========================================
func _load_map_data() -> void:
	var file = FileAccess.open("res://resources/cities.json", FileAccess.READ)
	if not file:
		_log_console("System Error: resources/cities.json not found.", Color(0.901, 0.298, 0.235))
		return
		
	var json_str = file.get_as_text()
	var json = JSON.parse_string(json_str)
	if not json or not json.has("cities"):
		_log_console("System Error: Corrupt route network dataset.", Color(0.901, 0.298, 0.235))
		return
		
	cities_data = json.cities
	
	# Project coordinates correctly using the aspect-ratio-preserving formula
	for city_id in cities_data:
		var city = cities_data[city_id]
		var lat = float(city.coords.x)
		var lon = float(city.coords.y)
		rendered_nodes[city_id] = _coords_to_pos(Vector2(lat, lon))
		
	# Center the camera inside projected bounds
	var mid_pos = Vector2(
		view_offset.x + view_size.x * 0.5,
		view_offset.y + view_size.y * 0.5
	)
	camera.position = mid_pos
	
	_log_console("Route network loaded: %d cities, projected correctly on vector dashboard." % cities_data.size(), Color(0.18, 0.8, 0.44))
	map_drawer.queue_redraw()

# ==========================================
# ANIMATIONS AND PROJECTIONS
# ==========================================
var active_map_events = []
var active_ai_trucks = []
var event_timer: Timer

func _setup_world_events():
	event_timer = Timer.new()
	event_timer.wait_time = 15.0
	event_timer.autostart = true
	event_timer.timeout.connect(_spawn_random_map_event)
	add_child(event_timer)
	
	NetworkManager.ws_message_received.connect(func(json):
		if typeof(json) == TYPE_DICTIONARY and json.has("type") and json.type == "ai_truck_spawn":
			var payload = json.payload
			var o_id = payload.origin
			var d_id = payload.destination
			if map_data.has("cities") and map_data.cities.has(o_id) and map_data.cities.has(d_id):
				var oc = map_data.cities[o_id].coords
				var dc = map_data.cities[d_id].coords
				active_ai_trucks.append({
					"pos1": _coords_to_pos(oc.x, oc.y),
					"pos2": _coords_to_pos(dc.x, dc.y),
					"color": Color(payload.color),
					"name": payload.companyName,
					"timer": 0.0,
					"duration": payload.duration,
					"is_police": payload.has("isPolice") and payload.isPolice
				})
	)

func _spawn_random_map_event():
	if map_data.is_empty() or not map_data.has("cities"): return
	var cities = map_data.cities.keys()
	if cities.size() < 2: return
	var city_id = cities[randi() % cities.size()]
	var city = map_data.cities[city_id]
	if not city.has("connections") or city.connections.is_empty(): return
	var conns = city.connections.keys()
	var target_id = conns[randi() % conns.size()]
	var target = map_data.cities[target_id]
	var pos1 = _coords_to_pos(city.coords.x, city.coords.y)
	var pos2 = _coords_to_pos(target.coords.x, target.coords.y)
	var ev_pos = pos1.lerp(pos2, 0.5)
	var types = [
		{"name": "POLICE_BLOCKADE", "icon": "🚨", "color": Color(1.0, 0.2, 0.2)},
		{"name": "SEVERE_STORM", "icon": "⛈️", "color": Color(0.2, 0.5, 1.0)},
		{"name": "SURGE_PRICING", "icon": "💰", "color": Color(0.2, 0.9, 0.4)}
	]
	var ev = types[randi() % types.size()]
	ev["pos"] = ev_pos
	ev["timer"] = 30.0 
	active_map_events.append(ev)

func _process(delta: float) -> void:
	time_passed += delta
	if active_map_events.size() > 0:
		for i in range(active_map_events.size() - 1, -1, -1):
			active_map_events[i].timer -= delta
			if active_map_events[i].timer <= 0:
				active_map_events.remove_at(i)
	if active_ai_trucks.size() > 0:
		for i in range(active_ai_trucks.size() - 1, -1, -1):
			active_ai_trucks[i].timer += delta
			if active_ai_trucks[i].timer >= active_ai_trucks[i].duration:
				active_ai_trucks.remove_at(i)
	if map_drawer:
		map_drawer.queue_redraw()
	if clock_lbl and is_instance_valid(clock_lbl):
		clock_lbl.text = GameState.get_simulated_time_string()


func _pos_to_coords(pos: Vector2) -> Vector2:
	var avg_lat = (map_min_lat + map_max_lat) * 0.5
	var cos_lat = cos(avg_lat * PI / 180.0)
	
	var min_lat = map_min_lat
	var max_lat = map_max_lat
	var min_lon = map_min_lon
	var max_lon = map_max_lon
	
	var geo_width = (max_lon - min_lon) * cos_lat
	var geo_height = (max_lat - min_lat)
	
	var padding = 60.0
	var available_w = view_size.x - padding * 2.0
	var available_h = view_size.y - padding * 2.0
	
	var scale_x = available_w / geo_width
	var scale_y = available_h / geo_height
	var map_scale = min(scale_x, scale_y)
	
	var center_lat = (min_lat + max_lat) * 0.5
	var center_lon = (min_lon + max_lon) * 0.5
	
	var screen_center = view_offset + view_size * 0.5
	
	var dx = (pos.x - screen_center.x) / map_scale
	var dy = (screen_center.y - pos.y) / map_scale
	
	var lat = center_lat + dy
	var lon = center_lon + dx / cos_lat
	
	return Vector2(lat, lon)

func _coords_to_pos(coords: Vector2) -> Vector2:
	var lat = coords.x
	var lon = coords.y
	
	var avg_lat = (map_min_lat + map_max_lat) * 0.5
	var cos_lat = cos(avg_lat * PI / 180.0)
	
	var min_lat = map_min_lat
	var max_lat = map_max_lat
	var min_lon = map_min_lon
	var max_lon = map_max_lon
	
	var geo_width = (max_lon - min_lon) * cos_lat
	var geo_height = (max_lat - min_lat)
	
	var padding = 60.0
	var available_w = view_size.x - padding * 2.0
	var available_h = view_size.y - padding * 2.0
	
	var scale_x = available_w / geo_width
	var scale_y = available_h / geo_height
	var map_scale = min(scale_x, scale_y)
	
	var center_lat = (min_lat + max_lat) * 0.5
	var center_lon = (min_lon + max_lon) * 0.5
	
	var screen_center = view_offset + view_size * 0.5
	
	var dy = lat - center_lat
	var dx = (lon - center_lon) * cos_lat
	
	return Vector2(
		screen_center.x + dx * map_scale,
		screen_center.y - dy * map_scale
	)

func _get_active_route_for_connection(from_id: String, to_id: String) -> Dictionary:
	for truck_id in GameState.active_routes:
		var route = GameState.active_routes[truck_id]
		var origin = ""
		var dest = ""
		if route.get("legalContract") != null:
			origin = route.get("legalContract").get("origin", "").to_lower()
			dest = route.get("legalContract").get("destination", "").to_lower()
		elif route.get("contrabandJob") != null:
			origin = route.get("contrabandJob").get("origin", "").to_lower()
			dest = route.get("contrabandJob").get("destination", "").to_lower()
		
		if (origin == from_id and dest == to_id) or (origin == to_id and dest == from_id):
			return route
	return {}

func _fetch_active_routes() -> void:
	var http = HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(
		func(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
			http.queue_free()
			if response_code == 200:
				var data = JSON.parse_string(body.get_string_from_utf8())
				if data and data is Array:
					GameState.active_routes.clear()
					for route in data:
						var truck_id = route.get("truckId", "")
						if truck_id != "":
							GameState.active_routes[truck_id] = route
					map_drawer.queue_redraw()
	)
	var url = NetworkManager.HTTP_URL + "/dispatch/active"
	http.request(
		url,
		["Authorization: Bearer " + NetworkManager.jwt_token],
		HTTPClient.METHOD_GET
	)

func _draw_dashed_line(from: Vector2, to: Vector2, color: Color, width: float, dash_len: float = 6.0, gap_len: float = 4.0, scroll_offset: float = 0.0) -> void:
	var dir = (to - from).normalized()
	var dist = from.distance_to(to)
	
	var cycle_len = dash_len + gap_len
	var offset = fmod(scroll_offset, cycle_len)
	if offset < 0.0:
		offset += cycle_len
		
	var current_dist = -offset
	while current_dist < dist:
		var start_pt = current_dist
		var end_pt = current_dist + dash_len
		
		start_pt = clamp(start_pt, 0.0, dist)
		end_pt = clamp(end_pt, 0.0, dist)
		
		if end_pt > start_pt:
			map_drawer.draw_line(from + dir * start_pt, from + dir * end_pt, color, width)
			
		current_dist += cycle_len

func _draw_dashed_polyline(points: Array, color: Color, width: float, dash_len: float = 6.0, gap_len: float = 4.0) -> void:
	if points.size() < 2:
		return
	for i in range(points.size() - 1):
		_draw_dashed_line(points[i], points[i + 1], color, width, dash_len, gap_len)

func _draw_polyline(points: Array, color: Color, width: float) -> void:
	if points.size() < 2:
		return
	for i in range(points.size() - 1):
		map_drawer.draw_line(points[i], points[i + 1], color, width)

# ==========================================
# 2D VECTOR RENDERING (DRAW OVERRIDES)
# ==========================================
func _draw_vector_map() -> void:
	print("[DEBUG] _draw_vector_map() called! cities_data count: ", cities_data.size())
	var font = ThemeDB.get_fallback_font()
	if not font:
		font = get_theme_font("font")
	var font_size = 10
	var text_color = Color(0.2, 0.45, 0.55, 0.4)
	
	# Determine current zoom and active visible viewport boundaries
	var viewport_size = map_drawer.get_viewport_rect().size
	var zoom = camera.zoom.x
	print("[DEBUG] Camera position: ", camera.position if is_instance_valid(camera) else "null", " zoom: ", zoom, " viewport_size: ", viewport_size)
	var visible_min = camera.position - (viewport_size / zoom) * 0.5
	var visible_max = camera.position + (viewport_size / zoom) * 0.5
	
	# Unobscured viewport boundaries accounting for HUD TopBar (56px) and SidePanel (300px)
	var visible_left = visible_min.x
	var visible_right = visible_max.x - (300.0 / zoom)
	var visible_top = visible_min.y + (56.0 / zoom)
	var visible_bottom = visible_max.y
	
	# Ensure boundaries are sanely separated to prevent divide-by-zero or overlap bugs
	visible_right = max(visible_right, visible_left + 1.0)
	visible_top = min(visible_top, visible_bottom - 1.0)
	
	# A. DRAW GEOGRAPHIC COASTLINES WITH TRIPLE WAVE RIPPLE (Concentric Parallel Coastlines)
	for ripple_idx in range(3):
		var alpha = 0.35
		var offset = Vector2.ZERO
		var ripple_width = 2.0
		if ripple_idx == 0:
			alpha = 0.35
			offset = Vector2.ZERO
			ripple_width = 2.0
		elif ripple_idx == 1:
			alpha = 0.15
			var ripple_t = time_passed * 2.5
			offset = Vector2(-4.0, -4.0) + Vector2(sin(ripple_t) * 1.0, cos(ripple_t) * 1.0)
			ripple_width = 1.0
		else:
			alpha = 0.05
			var ripple_t_else = time_passed * 1.8
			offset = Vector2(-8.0, -8.0) + Vector2(sin(ripple_t_else) * 1.5, cos(ripple_t_else) * 1.5)
			ripple_width = 1.0
			
		var ripple_color = Color(0.12, 0.45, 0.70, alpha)
		for coast in coastlines:
			var coast_projected_points = []
			for pt in coast:
				coast_projected_points.append(_coords_to_pos(pt) + offset)
			_draw_polyline(coast_projected_points, ripple_color, ripple_width / zoom)
			
		# Next-Gen ULTRA_HD Neon Coastline Vector Glow
		if ripple_idx == 0 and GameState.graphics_quality == "ULTRA_HD":
			for coast in coastlines:
				var coast_projected_points = []
				for pt in coast:
					coast_projected_points.append(_coords_to_pos(pt))
				_draw_polyline(coast_projected_points, Color(0.12, 0.45, 0.70, 0.05), 8.0 / zoom)
				_draw_polyline(coast_projected_points, Color(0.12, 0.45, 0.70, 0.15), 4.0 / zoom)
		
	# B. DRAW STYLIZED COUNTRY BORDERS
	for border in borders:
		var border_projected_points = []
		for pt in border.points:
			border_projected_points.append(_coords_to_pos(pt))
			
		if border.is_schengen:
			# Glowing blue region border for Schengen
			var schengen_border_color = Color(0.0, 0.60, 1.0, 0.4)
			var schengen_glow_color = Color(0.0, 0.60, 1.0, 0.1)
			_draw_dashed_polyline(border_projected_points, schengen_glow_color, 4.5 / zoom, 5.0 / zoom, 4.0 / zoom)
			_draw_dashed_polyline(border_projected_points, schengen_border_color, 1.5 / zoom, 5.0 / zoom, 4.0 / zoom)
		else:
			# Darker blue region border for External zone
			var external_border_color = Color(0.1, 0.3, 0.9, 0.75)
			var glow_color = Color(0.1, 0.3, 0.9, 0.18)
			_draw_dashed_polyline(border_projected_points, glow_color, 4.5 / zoom, 5.0 / zoom, 4.0 / zoom)
			_draw_dashed_polyline(border_projected_points, external_border_color, 2.5 / zoom, 5.0 / zoom, 4.0 / zoom)
	
	# 1. DRAW COORDINATE GRID LINES
	var step_deg: float = 1.0
	if zoom <= 0.35:
		step_deg = 4.0
	elif zoom <= 0.8:
		step_deg = 2.0
	elif zoom <= 1.5:
		step_deg = 1.0
	elif zoom <= 3.0:
		step_deg = 0.5
	else:
		step_deg = 0.2
		
	var coord_bottom_left = _pos_to_coords(Vector2(visible_min.x, visible_max.y))
	var coord_top_right = _pos_to_coords(Vector2(visible_max.x, visible_min.y))
	
	var min_visible_lat = max(coord_bottom_left.x, -85.0)
	var max_visible_lat = min(coord_top_right.x, 85.0)
	var min_visible_lon = max(coord_bottom_left.y, -180.0)
	var max_visible_lon = min(coord_top_right.y, 180.0)
	
	var start_lat = floor(min_visible_lat / step_deg) * step_deg
	var start_lon = floor(min_visible_lon / step_deg) * step_deg
	
	# Horizontal lines (Latitude)
	var lat = start_lat
	while lat <= max_visible_lat + 0.01:
		if lat >= -85.01 and lat <= 85.01:
			var pos_y = _coords_to_pos(Vector2(lat, min_visible_lon)).y
			map_drawer.draw_line(Vector2(visible_min.x, pos_y), Vector2(visible_max.x, pos_y), Color(0.1, 0.3, 0.4, 0.12), 1.0 / zoom)
			
			# Only draw coordinate labels if they are within the active/visible map viewport area
			if pos_y >= visible_top and pos_y <= visible_bottom:
				var lat_txt = "%.1f° N" % lat
				var label_x = visible_left + 15.0 / zoom
				var label_y = pos_y + 4.0 / zoom
				var draw_font_size = clamp(int(10.0 / zoom), 5, 32)
				map_drawer.draw_string(font, Vector2(label_x, label_y), lat_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, draw_font_size, text_color)
		lat += step_deg
		
	# Vertical lines (Longitude)
	var lon = start_lon
	while lon <= max_visible_lon + 0.01:
		if lon >= -180.01 and lon <= 180.01:
			var pos_x = _coords_to_pos(Vector2(min_visible_lat, lon)).x
			map_drawer.draw_line(Vector2(pos_x, visible_min.y), Vector2(pos_x, visible_max.y), Color(0.1, 0.3, 0.4, 0.12), 1.0 / zoom)
			
			# Only draw coordinate labels if they are within the active/visible map viewport area
			if pos_x >= visible_left and pos_x <= visible_right:
				var lon_txt = "%.1f° E" % lon
				var label_x = pos_x - 20.0 / zoom
				var label_y = visible_top + 16.0 / zoom
				var draw_font_size = clamp(int(10.0 / zoom), 5, 32)
				map_drawer.draw_string(font, Vector2(label_x, label_y), lon_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, draw_font_size, text_color)
		lon += step_deg
 
	# 2. DRAW VIEWPORT CORNER TICKS
	var active_corners = [
		Vector2(visible_left, visible_top),
		Vector2(visible_right, visible_top),
		Vector2(visible_right, visible_bottom),
		Vector2(visible_left, visible_bottom)
	]
	var tick_size = 15.0 / zoom
	var tick_color = Color(0.2, 0.8, 1.0, 0.4)
	
	# Top-Left Corner
	map_drawer.draw_line(active_corners[0], active_corners[0] + Vector2(tick_size, 0), tick_color, 2.0 / zoom)
	map_drawer.draw_line(active_corners[0], active_corners[0] + Vector2(0, tick_size), tick_color, 2.0 / zoom)
	# Top-Right Corner
	map_drawer.draw_line(active_corners[1], active_corners[1] + Vector2(-tick_size, 0), tick_color, 2.0 / zoom)
	map_drawer.draw_line(active_corners[1], active_corners[1] + Vector2(0, tick_size), tick_color, 2.0 / zoom)
	# Bottom-Right Corner
	map_drawer.draw_line(active_corners[2], active_corners[2] + Vector2(-tick_size, 0), tick_color, 2.0 / zoom)
	map_drawer.draw_line(active_corners[2], active_corners[2] + Vector2(0, -tick_size), tick_color, 2.0 / zoom)
	# Bottom-Left Corner
	map_drawer.draw_line(active_corners[3], active_corners[3] + Vector2(tick_size, 0), tick_color, 2.0 / zoom)
	map_drawer.draw_line(active_corners[3], active_corners[3] + Vector2(0, -tick_size), tick_color, 2.0 / zoom)
 
	# 3. DRAW SCALE BAR
	var scale_pos = Vector2(visible_left + 20.0 / zoom, visible_bottom - 25.0 / zoom)
	var scale_width = 150.0 / zoom
	var scale_km = int(100.0 / zoom)
	var scale_text = "TACTICAL SCALE: %d KM" % scale_km
	
	map_drawer.draw_line(scale_pos, scale_pos + Vector2(scale_width, 0), Color(0.2, 0.8, 1.0, 0.6), 2.0 / zoom)
	map_drawer.draw_line(scale_pos, scale_pos + Vector2(0, -8.0 / zoom), Color(0.2, 0.8, 1.0, 0.6), 2.0 / zoom)
	map_drawer.draw_line(scale_pos + Vector2(scale_width, 0), scale_pos + Vector2(scale_width, -8.0 / zoom), Color(0.2, 0.8, 1.0, 0.6), 2.0 / zoom)
	map_drawer.draw_line(scale_pos + Vector2(scale_width / 2.0, 0), scale_pos + Vector2(scale_width / 2.0, -5.0 / zoom), Color(0.2, 0.8, 1.0, 0.6), 1.5 / zoom)
	map_drawer.draw_string(font, scale_pos + Vector2(10.0 / zoom, -12.0 / zoom), scale_text, HORIZONTAL_ALIGNMENT_LEFT, -1, clamp(int(9.0 / zoom), 5, 24), Color(0.2, 0.8, 1.0, 0.7))
 
	# Next-Gen ULTRA_HD Graphics Mode features
	if GameState.graphics_quality == "ULTRA_HD":
		# A. Holographic vertical scanning sweep line
		var sweep_y_pct = fmod(time_passed * 0.15, 1.0)
		var sweep_y = visible_min.y + (visible_max.y - visible_min.y) * sweep_y_pct
		var sweep_color = Color(0.2, 0.9, 0.7, 0.15 * (1.0 - sin(time_passed * 10.0) * 0.05))
		map_drawer.draw_line(Vector2(visible_min.x, sweep_y), Vector2(visible_max.x, sweep_y), sweep_color, 2.0 / zoom)
		
		# Trailing gradient scanner glows
		var trail_height = 40.0 / zoom
		var trail_steps = 4
		for i in range(trail_steps):
			var step_y = sweep_y - (float(i) * trail_height / float(trail_steps))
			if step_y >= visible_min.y:
				var step_alpha = 0.08 * (1.0 - float(i) / float(trail_steps))
				map_drawer.draw_line(Vector2(visible_min.x, step_y), Vector2(visible_max.x, step_y), Color(0.2, 0.9, 0.7, step_alpha), 1.0 / zoom)
				
		# B. Flickering simulated satellite telemetry in corner readouts
		var signal_strength = 95.0 + sin(time_passed * 4.3) * 3.0 + (randf() - 0.5) * 1.5
		signal_strength = clamp(signal_strength, 0.0, 100.0)
		
		var telemetry_alpha = 0.65
		if fmod(time_passed * 0.8, 5.0) < 0.1:
			telemetry_alpha = 0.25 # occasional rapid signal flicker
			
		var tel_font_size = clamp(int(7.0 / zoom), 5, 24)
		var tel_color = Color(0.2, 0.9, 0.7, telemetry_alpha)
		var tel_y_spacing = 11.0 / zoom
		
		var lines_tr = [
			"SATELLITE DOWNLINK: SECURE",
			"SIGNAL STRENGTH: %.2f%%" % signal_strength,
			"GRID STATUS: OPTIMAL",
			"MATRIX SYSTEM: ACTIVE"
		]
		for i in range(lines_tr.size()):
			var text_y = visible_top + 16.0 / zoom + (i * tel_y_spacing)
			var text_x = visible_right - 140.0 / zoom
			map_drawer.draw_string(font, Vector2(text_x, text_y), lines_tr[i], HORIZONTAL_ALIGNMENT_LEFT, -1, tel_font_size, tel_color)
			
		var lines_bl = [
			"SECURE BACKLINK: //LOGISTIXPERT.NET",
			"SYS_SEC_LOCK: AES_256",
			"LOC_TIME: " + Time.get_time_string_from_system()
		]
		for i in range(lines_bl.size()):
			var text_y = scale_pos.y - 35.0 / zoom - (i * tel_y_spacing)
			var text_x = visible_left + 20.0 / zoom
			map_drawer.draw_string(font, Vector2(text_x, text_y), lines_bl[i], HORIZONTAL_ALIGNMENT_LEFT, -1, tel_font_size, Color(0.18, 0.80, 0.44, telemetry_alpha * 0.7))

	# 4. DRAW CONNECTION ROUTES (Flowing network pipelines)
	for city_id in cities_data:
		var city = cities_data[city_id]
		var start_pos = rendered_nodes[city_id]
		
		for conn_id in city.connections:
			if city_id < conn_id and rendered_nodes.has(conn_id):
				var end_pos = rendered_nodes[conn_id]
				var conn = city.connections[conn_id]
				
				# Get active route details for this connection
				var active_route = _get_active_route_for_connection(city_id, conn_id)
				var is_active = not active_route.is_empty()
				var is_selected_conn = (city_id == selected_city_id or conn_id == selected_city_id)
				
				if is_active:
					var is_smuggle = active_route.get("contrabandJobId") != null or active_route.get("isSmuggling", false)
					
					# 1. Translucent wider solid pipeline backing
					var backing_color = Color(0.607, 0.349, 0.713, 0.12) if is_smuggle else Color(0.180, 0.803, 0.443, 0.12)
					map_drawer.draw_line(start_pos, end_pos, backing_color, 8.0 / zoom, true)
					
					# 2. Solid base line
					var base_line_color = Color(0.607, 0.349, 0.713, 0.4) if is_smuggle else Color(0.180, 0.803, 0.443, 0.4)
					map_drawer.draw_line(start_pos, end_pos, base_line_color, 1.5 / zoom, true)
					
					# 3. Flowing dashed animation core (respects travel direction!)
					var origin = ""
					var dest = ""
					if active_route.get("legalContract") != null:
						origin = active_route.get("legalContract").get("origin", "").to_lower()
						dest = active_route.get("legalContract").get("destination", "").to_lower()
					elif active_route.get("contrabandJob") != null:
						origin = active_route.get("contrabandJob").get("origin", "").to_lower()
						dest = active_route.get("contrabandJob").get("destination", "").to_lower()
						
					var flow_from = start_pos
					var flow_to = end_pos
					if origin == conn_id and dest == city_id:
						flow_from = end_pos
						flow_to = start_pos
						
					var flow_color = Color(0.75, 0.45, 1.0, 0.95) if is_smuggle else Color(0.2, 0.95, 0.5, 0.95)
					_draw_dashed_line(flow_from, flow_to, flow_color, 2.0 / zoom, 8.0 / zoom, 6.0 / zoom, time_passed * 42.0)
					
				else:
					var is_tunnel = (city_id == "calais" and conn_id == "dover") or (city_id == "dover" and conn_id == "calais")
					var sea_routes = ["stockholm_tallinn", "stockholm_gdansk", "helsinki_tallinn", "turku_stockholm", "stockholm_turku", "visby_stockholm", "visby_riga", "visby_klaipeda", "oslo_copenhagen", "stockholm_oslo", "london_amsterdam", "amsterdam_london"]
					var is_sea_route = sea_routes.has(city_id + "_" + conn_id) or sea_routes.has(conn_id + "_" + city_id)
					var fuel_routes = ["istanbul_ankara", "ankara_tehran", "tehran_kabul", "ankara_baghdad", "baghdad_riyadh", "riyadh_dubai", "tehran_dubai"]
					var is_fuel_route = fuel_routes.has(city_id + "_" + conn_id) or fuel_routes.has(conn_id + "_" + city_id)

					var line_color = Color(0.0, 0.85, 1.0, 0.35) # cyan legal routes
					var route_width = 1.5 / zoom
					var is_dashed = false
					var dash_l = 6.0 / zoom
					var gap_l = 4.0 / zoom
					var dash_anim = 0.0

					var conn_type = conn.get("type", "legal")
					if conn_type == "underworld":
						line_color = Color(0.92, 0.45, 0.15, 0.35) # underworld orange
						
					if is_tunnel:
						line_color = Color(0.78, 0.20, 1.0, 0.6) # Neon purple
						is_dashed = true
						dash_l = 10.0 / zoom
						gap_l = 5.0 / zoom
					elif is_sea_route:
						line_color = Color(0.0, 0.90, 1.0, 0.5) # Neon blue
						is_dashed = true
						dash_l = 4.0 / zoom
						gap_l = 6.0 / zoom
					elif is_fuel_route:
						line_color = Color(1.0, 0.84, 0.0, 0.7) # Glowing gold
						is_dashed = true
						dash_l = 15.0 / zoom
						gap_l = 5.0 / zoom
						dash_anim = time_passed * 15.0 # steady flow animation
						
					if is_selected_conn:
						line_color.a = 0.7
						route_width = 2.0 / zoom
						if is_fuel_route:
							route_width = 3.5 / zoom
							line_color = Color(1.0, 0.84, 0.0, 0.9)
						
					if is_dashed:
						_draw_dashed_line(start_pos, end_pos, line_color, route_width, dash_l, gap_l, dash_anim)
					else:
						_draw_aberrated_line(start_pos, end_pos, line_color, route_width)
 
	# 5. DRAW ACTIVE TELEMETRY PULSES
	for pulse_city_id in cities_data:
		var pulse_city = cities_data[pulse_city_id]
		var pulse_start_pos = rendered_nodes[pulse_city_id]
		
		for pulse_conn_id in pulse_city.connections:
			if rendered_nodes.has(pulse_conn_id):
				var pulse_end_pos = rendered_nodes[pulse_conn_id]
				var pulse_conn = pulse_city.connections[pulse_conn_id]
				
				# Get active route details for this connection
				var pulse_active_route = _get_active_route_for_connection(pulse_city_id, pulse_conn_id)
				var pulse_is_active = not pulse_active_route.is_empty()
				
				if pulse_is_active:
					# Determine direction of travel
					var pulse_origin = ""
					var pulse_dest = ""
					if pulse_active_route.get("legalContract") != null:
						pulse_origin = pulse_active_route.get("legalContract").get("origin", "").to_lower()
						pulse_dest = pulse_active_route.get("legalContract").get("destination", "").to_lower()
					elif pulse_active_route.get("contrabandJob") != null:
						pulse_origin = pulse_active_route.get("contrabandJob").get("origin", "").to_lower()
						pulse_dest = pulse_active_route.get("contrabandJob").get("destination", "").to_lower()
					
					var pulse_start = pulse_start_pos
					var pulse_end = pulse_end_pos
					if pulse_origin == pulse_conn_id and pulse_dest == pulse_city_id:
						pulse_start = pulse_end_pos
						pulse_end = pulse_start_pos
					elif pulse_origin != pulse_city_id or pulse_dest != pulse_conn_id:
						continue
					
					var pct = float(pulse_active_route.get("progressPct", 0.0)) / 100.0
					var pulse_pos = pulse_start.lerp(pulse_end, pct)
					
					var pulse_is_smuggle = pulse_active_route.get("contrabandJobId") != null or pulse_active_route.get("isSmuggling", false)
					var pulse_color = Color(0.2, 0.9, 0.5, 0.8)
					if pulse_is_smuggle:
						pulse_color = Color(0.8, 0.4, 1.0, 0.9)
					elif pulse_conn.get("is_border_crossing", false):
						pulse_color = Color(1.0, 0.6, 0.1, 0.9)
						
					map_drawer.draw_circle(pulse_pos, 4.0 / zoom, pulse_color)
					map_drawer.draw_arc(pulse_pos, (6.0 + sin(time_passed * 8.0) * 1.5) / zoom, 0.0, TAU, 8, Color(pulse_color.r, pulse_color.g, pulse_color.b, 0.35), 1.5 / zoom)
 
	# 6. DRAW ROTATING RADAR SWEEP
	var sweep_center = Vector2.ZERO
	var has_sweep = false
	if not selected_city_id.is_empty() and rendered_nodes.has(selected_city_id):
		sweep_center = rendered_nodes[selected_city_id]
		has_sweep = true
	elif not hovered_city_id.is_empty() and rendered_nodes.has(hovered_city_id):
		sweep_center = rendered_nodes[hovered_city_id]
		has_sweep = true
		
	if has_sweep:
		var radar_radius = 70.0 / zoom
		var sweep_angle = time_passed * 1.8
		
		# Draw outer fading circle
		map_drawer.draw_arc(sweep_center, radar_radius, 0.0, TAU, 32, Color(0.65, 0.45, 1.0, 0.25), 1.0 / zoom)
		
		# Draw sweeping arm
		var sweep_dir = Vector2(cos(sweep_angle), sin(sweep_angle))
		map_drawer.draw_line(sweep_center, sweep_center + sweep_dir * radar_radius, Color(0.65, 0.45, 1.0, 0.7), 1.5 / zoom)
		
		# Draw rotating sweeps trail
		for i in range(5):
			var angle_offset = -float(i) * 0.12
			var sector_dir = Vector2(cos(sweep_angle + angle_offset), sin(sweep_angle + angle_offset))
			var alpha_trail = 0.45 * (1.0 - float(i) / 5.0)
			map_drawer.draw_line(sweep_center, sweep_center + sector_dir * radar_radius, Color(0.65, 0.45, 1.0, alpha_trail), 1.0 / zoom)
 
	# 7. DRAW CITY NODES (On top of routes/grid)
	for node_city_id in cities_data:
		var node_city = cities_data[node_city_id]
		var pos = rendered_nodes[node_city_id]
		
		var radius = 8.0
		var outer_color = Color(0.18, 0.8, 0.44, 1.0) # default friendly green
		var inner_color = Color(0.04, 0.04, 0.06, 1.0)
		
		var node_type = node_city.get("type", "friendly")
		if node_type == "friendly":
			outer_color = Color(0.0, 1.0, 0.3) # vibrant green for terminal nodes
		elif node_type == "high_risk":
			outer_color = Color(0.92, 0.45, 0.15) # high risk orange
		elif node_type == "underworld":
			outer_color = Color(0.0, 1.0, 0.3) # also terminal node green
			
		# Subtle ambient glow pulsers for all nodes
		var pulse = sin(time_passed * 4.0 + hash(node_city_id)) * 1.5
		map_drawer.draw_circle(pos, (radius + 4.0 + pulse) / zoom, Color(outer_color.r, outer_color.g, outer_color.b, 0.15))
		
		# Thin elegant rotating cyber-rings for all nodes
		var r_ring_angle = time_passed * 0.8 + hash(node_city_id)
		var ring_color = Color(outer_color.r, outer_color.g, outer_color.b, 0.25)
		map_drawer.draw_arc(pos, (radius + 5.0) / zoom, r_ring_angle, r_ring_angle + PI * 0.3, 8, ring_color, 1.0 / zoom)
		map_drawer.draw_arc(pos, (radius + 5.0) / zoom, r_ring_angle + PI, r_ring_angle + PI * 1.3, 8, ring_color, 1.0 / zoom)
		
		if node_city_id == hovered_city_id:
			radius = 11.0
			outer_color = Color(0.2, 0.9, 0.7, 1.0)
			
			# Draw spinning HUD dashed outer octagon for hover
			var oct_rad = 18.0 / zoom
			var rot_offset = time_passed * 1.5
			for i in range(8):
				var angle_start = rot_offset + (PI / 4.0) * i
				var angle_end = angle_start + (PI / 8.0)
				map_drawer.draw_arc(pos, oct_rad, angle_start, angle_end, 3, Color(0.2, 0.9, 0.7, 0.65), 1.0 / zoom)
				
			# Draw corner HUD brackets around hover
			var b_sz = 5.0 / zoom
			var b_offset = 15.0 / zoom
			var b_color = Color(0.2, 0.9, 0.7, 0.8)
			# Top-left corner bracket
			map_drawer.draw_line(pos + Vector2(-b_offset, -b_offset), pos + Vector2(-b_offset + b_sz, -b_offset), b_color, 1.0 / zoom)
			map_drawer.draw_line(pos + Vector2(-b_offset, -b_offset), pos + Vector2(-b_offset, -b_offset + b_sz), b_color, 1.0 / zoom)
			# Top-right
			map_drawer.draw_line(pos + Vector2(b_offset, -b_offset), pos + Vector2(b_offset - b_sz, -b_offset), b_color, 1.0 / zoom)
			map_drawer.draw_line(pos + Vector2(b_offset, -b_offset), pos + Vector2(b_offset, -b_offset + b_sz), b_color, 1.0 / zoom)
			# Bottom-left
			map_drawer.draw_line(pos + Vector2(-b_offset, b_offset), pos + Vector2(-b_offset + b_sz, b_offset), b_color, 1.0 / zoom)
			map_drawer.draw_line(pos + Vector2(-b_offset, b_offset), pos + Vector2(-b_offset, b_offset - b_sz), b_color, 1.0 / zoom)
			# Bottom-right
			map_drawer.draw_line(pos + Vector2(b_offset, b_offset), pos + Vector2(b_offset - b_sz, b_offset), b_color, 1.0 / zoom)
			map_drawer.draw_line(pos + Vector2(b_offset, b_offset), pos + Vector2(b_offset, b_offset - b_sz), b_color, 1.0 / zoom)
			
		elif node_city_id == selected_city_id:
			radius = 10.0
			outer_color = Color(0.65, 0.45, 1.0, 1.0)
			
			# Selected crosshair targeting reticle lines
			var ret_color = Color(0.65, 0.45, 1.0, 0.5)
			map_drawer.draw_line(pos + Vector2(-22.0 / zoom, 0.0), pos + Vector2(-12.0 / zoom, 0.0), ret_color, 1.0 / zoom)
			map_drawer.draw_line(pos + Vector2(12.0 / zoom, 0.0), pos + Vector2(22.0 / zoom, 0.0), ret_color, 1.0 / zoom)
			map_drawer.draw_line(pos + Vector2(0.0, -22.0 / zoom), pos + Vector2(0.0, -12.0 / zoom), ret_color, 1.0 / zoom)
			map_drawer.draw_line(pos + Vector2(0.0, 12.0 / zoom), pos + Vector2(0.0, 22.0 / zoom), ret_color, 1.0 / zoom)
			
			# Rotating outer brackets
			var r_sel_angle = -time_passed * 2.0
			map_drawer.draw_arc(pos, 16.0 / zoom, r_sel_angle, r_sel_angle + PI * 0.4, 12, Color(0.65, 0.45, 1.0, 0.8), 1.5 / zoom)
			map_drawer.draw_arc(pos, 16.0 / zoom, r_sel_angle + PI, r_sel_angle + PI * 1.4, 12, Color(0.65, 0.45, 1.0, 0.8), 1.5 / zoom)
			
		# Draw layered vector circles
		map_drawer.draw_circle(pos, (radius + 2.0) / zoom, outer_color)
		map_drawer.draw_circle(pos, (radius - 2.0) / zoom, inner_color)
		
		# --- DIRECT MAP TEXT LABELING ---
		# Draw city names + code next to each coordinate node using clean tiny styling (zoom & scale-aware)
		var node_label_font = ThemeDB.get_fallback_font()
		if not node_label_font:
			node_label_font = get_theme_font("font")
		if node_label_font:
			var label_text = node_city.name.to_upper()
			var label_col = Color(0.709, 0.768, 0.843, 0.85)
			var label_bg_col = Color(0.04, 0.04, 0.06, 0.65)
			
			if node_city_id == selected_city_id:
				label_text += " [SEL]"
				label_col = Color(0.65, 0.45, 1.0, 1.0)
			elif node_city_id == hovered_city_id:
				label_text += " [HOV]"
				label_col = Color(0.2, 0.9, 0.7, 1.0)
			else:
				var zone_code = " // CZ" if not node_city.is_schengen else " // OK"
				label_text += zone_code
				label_col = Color(0.180, 0.803, 0.443, 0.65) if node_city.is_schengen else Color(0.925, 0.607, 0.141, 0.65)
			
			var draw_city_font_size = clamp(int(8.0 / zoom), 6, 24)
			var text_sz = node_label_font.get_string_size(label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, draw_city_font_size)
			
			var text_offset = Vector2(14.0 / zoom, 4.0 / zoom)
			var text_pos = pos + text_offset
			
			# Draw background box scaled to text size
			map_drawer.draw_rect(Rect2(text_pos + Vector2(-2.0 / zoom, -draw_city_font_size * 1.25), text_sz + Vector2(4.0 / zoom, 2.0 / zoom)), label_bg_col, true)
			
			if node_city_id == "siauliai":
				map_drawer.draw_string(node_label_font, text_pos - Vector2(16.0 / zoom, 0), "⌂", HORIZONTAL_ALIGNMENT_LEFT, -1, draw_city_font_size + 4, Color(0.18, 0.8, 0.44))
				
			map_drawer.draw_string(node_label_font, text_pos, label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, draw_city_font_size, label_col)
 

	# 8. CURSOR TELEMETRY HUD CROSSHAIRS AND COORDINATES
	var mouse_pos = map_drawer.get_local_mouse_position()
	var inside_viewport = mouse_pos.x >= visible_left and mouse_pos.x <= visible_right and mouse_pos.y >= visible_top and mouse_pos.y <= visible_bottom
	if inside_viewport:
		var tel_cross_col = Color(0.2, 0.9, 0.7, 0.16)
		# Draw horizontal dashed crosshair line
		_draw_dashed_line(Vector2(visible_left, mouse_pos.y), Vector2(visible_right, mouse_pos.y), tel_cross_col, 1.0 / zoom, 4.0 / zoom, 4.0 / zoom)
		# Draw vertical dashed crosshair line
		_draw_dashed_line(Vector2(mouse_pos.x, visible_top), Vector2(mouse_pos.x, visible_bottom), tel_cross_col, 1.0 / zoom, 4.0 / zoom, 4.0 / zoom)
		
		# Get Geographic coordinates at cursor
		var geo_coord = _pos_to_coords(mouse_pos)
		
		var cursor_label_font = ThemeDB.get_fallback_font()
		if not cursor_label_font:
			cursor_label_font = get_theme_font("font")
		if cursor_label_font:
			# Left Margin Lat Box
			var lat_text = "%.3f° N" % geo_coord.x
			map_drawer.draw_rect(Rect2(Vector2(visible_left - 55.0 / zoom, mouse_pos.y - 8.0 / zoom), Vector2(50.0 / zoom, 15.0 / zoom)), Color(0.04, 0.04, 0.06, 0.85), true)
			map_drawer.draw_rect(Rect2(Vector2(visible_left - 55.0 / zoom, mouse_pos.y - 8.0 / zoom), Vector2(50.0 / zoom, 15.0 / zoom)), Color(0.2, 0.9, 0.7, 0.3), false, 1.0 / zoom)
			map_drawer.draw_string(cursor_label_font, Vector2(visible_left - 51.0 / zoom, mouse_pos.y + 3.0 / zoom), lat_text, HORIZONTAL_ALIGNMENT_LEFT, -1, clamp(int(7.0 / zoom), 5, 20), Color(0.2, 0.9, 0.7, 0.85))
			
			# Top Margin Lon Box
			var lon_text = "%.3f° E" % geo_coord.y
			map_drawer.draw_rect(Rect2(Vector2(mouse_pos.x - 26.0 / zoom, visible_top - 15.0 / zoom), Vector2(52.0 / zoom, 12.0 / zoom)), Color(0.04, 0.04, 0.06, 0.85), true)
			map_drawer.draw_rect(Rect2(Vector2(mouse_pos.x - 26.0 / zoom, visible_top - 15.0 / zoom), Vector2(52.0 / zoom, 12.0 / zoom)), Color(0.2, 0.9, 0.7, 0.3), false, 1.0 / zoom)
			map_drawer.draw_string(cursor_label_font, Vector2(mouse_pos.x - 22.0 / zoom, visible_top - 6.0 / zoom), lon_text, HORIZONTAL_ALIGNMENT_LEFT, -1, clamp(int(7.0 / zoom), 5, 20), Color(0.2, 0.9, 0.7, 0.85))

	for ev in active_map_events:
		var size = 20.0 / zoom + sin(Time.get_ticks_msec() * 0.005) * 5.0 / zoom
		var r = Rect2(ev.pos - Vector2(size/2.0, size/2.0), Vector2(size, size))
		map_drawer.draw_rect(r, ev.color, false, 2.0 / zoom)
		var f = ThemeDB.fallback_font
		if not f:
			f = get_theme_font("font")
		map_drawer.draw_string(f, ev.pos + Vector2(-8.0 / zoom, 6.0 / zoom), ev.icon, HORIZONTAL_ALIGNMENT_CENTER, -1, clamp(int(16.0 / zoom), 8, 32))

	for ai in active_ai_trucks:
		var progress = ease(ai.timer / ai.duration, 0.8) # Apply slight ease-out
		var current_pos = ai.pos1.lerp(ai.pos2, progress)
		var tail_progress = max(0.0, progress - 0.08) # Trail length
		var tail_pos = ai.pos1.lerp(ai.pos2, tail_progress)
		
		# Draw glowing trail
		if progress > 0.02:
			var trail_color = ai.color
			if ai.get("is_police", false):
				# Flashing red and blue siren lights!
				var flash = int(Time.get_ticks_msec() / 150.0) % 2
				trail_color = Color(1.0, 0.0, 0.0) if flash == 0 else Color(0.0, 0.0, 1.0)
				
			trail_color.a = 0.6
			var fade_color = trail_color
			fade_color.a = 0.0
			var points = PackedVector2Array([tail_pos, current_pos])
			var colors = PackedColorArray([fade_color, trail_color])
			map_drawer.draw_polyline_colors(points, colors, 4.0 / zoom, true)
			map_drawer.draw_polyline_colors(points, colors, 8.0 / zoom, true) # outer glow

		# Draw dynamic pulsing truck icon
		var f = ThemeDB.fallback_font
		if not f:
			f = get_theme_font("font")
		var pulse_scale = 1.0 + sin(Time.get_ticks_msec() * 0.008) * 0.15
		var font_size = clamp(int((18.0 * pulse_scale) / zoom), 8, 48)
		map_drawer.draw_string(f, current_pos + Vector2(-font_size/2.0, font_size/2.5), "🚛", HORIZONTAL_ALIGNMENT_CENTER, -1, font_size)
		
		# Draw syndicate name tag
		var tag_size = clamp(int(10.0 / zoom), 6, 20)
		map_drawer.draw_string(f, current_pos + Vector2(12.0/zoom, 4.0/zoom), ai.name, HORIZONTAL_ALIGNMENT_LEFT, -1, tag_size, ai.color)


# ==========================================
# INTERACTIVE DRAGS AND SCROLLS
# ==========================================
func _input(event: InputEvent) -> void:
	# 1. Drag Panning via Middle/Right mouse button
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_RIGHT or event.button_index == MOUSE_BUTTON_MIDDLE:
			if event.pressed:
				is_dragging = true
				drag_start = event.position
			else:
				is_dragging = false
				
		# 2. Zoom Controls via mouse wheel
		if event.pressed:
			if event.button_index == MOUSE_BUTTON_WHEEL_UP:
				zoom_level = min(zoom_level + 0.1, MAX_ZOOM)
				camera.zoom = Vector2(zoom_level, zoom_level)
			elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				zoom_level = max(zoom_level - 0.1, MIN_ZOOM)
				camera.zoom = Vector2(zoom_level, zoom_level)
				
			# Click detection
			if event.button_index == MOUSE_BUTTON_LEFT:
				if not hovered_city_id.is_empty():
					_select_city(hovered_city_id)
					
	if event is InputEventMouseMotion:
		if is_dragging:
			var diff = event.position - drag_start
			camera.position -= diff / zoom_level
			drag_start = event.position
		else:
			# Track hover detection
			_detect_hover_nodes(event.position)

func _detect_hover_nodes(mouse_screen_pos: Vector2) -> void:
	# Translate screen coordinates into canvas coordinate offsets (accounting for camera pan/zoom)
	var canvas_pos = map_drawer.get_local_mouse_position()
	
	var old_hover = hovered_city_id
	hovered_city_id = ""
	
	for city_id in rendered_nodes:
		var node_pos = rendered_nodes[city_id]
		var dist = canvas_pos.distance_to(node_pos)
		
		# Node interactive threshold (within 24 pixels)
		if dist < 24.0:
			hovered_city_id = city_id
			break
			
	if hovered_city_id != old_hover:
		map_drawer.queue_redraw()

func _select_city(city_id: String) -> void:
	selected_city_id = city_id
	map_drawer.queue_redraw()
	
	var city = cities_data[city_id]
	city_name_lbl.text = city.name
	
	if city.is_schengen:
		schengen_val_lbl.text = "ZONE: ACTIVE SCHENGEN (LOW RISK)"
		schengen_val_lbl.add_theme_color_override("font_color", Color(0.180, 0.803, 0.443))
	else:
		schengen_val_lbl.text = "ZONE: CUSTOM CHECKPOINT (WARNING)"
		schengen_val_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		
	# Redraw connections Side Panel lists
	for child in connection_list_box.get_children():
		if child.name != "Label":
			child.queue_free()
			
	for conn_id in city.connections:
		var conn = city.connections[conn_id]
		var dest_city = cities_data[conn_id].name
		
		var conn_lbl = Label.new()
		conn_lbl.theme_type_variation = "HeaderSmall"
		conn_lbl.add_theme_font_size_override("font_size", 14)
		
		var border_txt = " (Schengen)"
		if conn.get("is_border_crossing", false):
			border_txt = " [CUSTOM CROSSING]"
			conn_lbl.add_theme_color_override("font_color", Color(0.925, 0.607, 0.141))
		else:
			conn_lbl.add_theme_color_override("font_color", Color(0.709, 0.768, 0.843))
			
		conn_lbl.text = "➔ %s : %d km%s" % [dest_city, conn.distance_km, border_txt]
		connection_list_box.add_child(conn_lbl)
		
	surcharge_warning.hide()

# ==========================================
# UI THEME AND GAME STATE SYNC
# ==========================================
func _apply_hud_theme() -> void:
	# ConsoleBox embedded style with left border accent and transparent background
	var style_console = StyleBoxFlat.new()
	style_console.bg_color = Color(0.04, 0.04, 0.05, 0.5) # clean translucent background
	style_console.border_color = Color(0.925, 0.607, 0.141, 0.8) # warning orange left border accent
	style_console.set_border_width_all(0)
	style_console.border_width_left = 3 # left border accent
	style_console.set_corner_radius_all(0)
	style_console.shadow_size = 0
	console_box.add_theme_stylebox_override("panel", style_console)
	
	# Style RouteInfoPanel
	var style_route_info = StyleBoxFlat.new()
	style_route_info.bg_color = Color(0.05, 0.06, 0.07, 0.85)
	style_route_info.border_color = Color(0.2, 0.5, 0.7, 0.4)
	style_route_info.set_border_width_all(2)
	style_route_info.set_corner_radius_all(4)
	style_route_info.shadow_color = Color(0.2, 0.5, 0.7, 0.15)
	style_route_info.shadow_size = 6
	%RouteInfoPanel.add_theme_stylebox_override("panel", style_route_info)
	
	# Set custom button color overrides as requested
	laundry_btn.add_theme_color_override("font_color", Color(0.0, 0.85, 1.0, 1.0))
	underworld_btn.add_theme_color_override("font_color", Color(0.65, 0.35, 1.0, 1.0))
	support_btn.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0, 1.0))
	analytics_btn.add_theme_color_override("font_color", Color(0.2, 0.6, 1.0, 1.0))
	
	# Active Dispatch Center button style with glowing orange border, warm bg, and shadow
	var style_dispatch = StyleBoxFlat.new()
	style_dispatch.bg_color = Color(0.18, 0.1, 0.03, 0.9)
	style_dispatch.border_color = Color(0.925, 0.607, 0.141, 1.0)
	style_dispatch.set_border_width_all(2)
	style_dispatch.set_corner_radius_all(4)
	style_dispatch.shadow_color = Color(0.925, 0.607, 0.141, 0.3)
	style_dispatch.shadow_size = 6
	dispatch_btn.add_theme_stylebox_override("normal", style_dispatch)
	dispatch_btn.add_theme_stylebox_override("hover", style_dispatch)
	dispatch_btn.add_theme_stylebox_override("pressed", style_dispatch)
	dispatch_btn.add_theme_color_override("font_color", Color(1.0, 0.7, 0.2))
	
	# Style GarageDropdown
	var style_g_drop = StyleBoxFlat.new()
	style_g_drop.bg_color = Color(0.04, 0.08, 0.05, 0.95)
	style_g_drop.border_color = Color(0.18, 0.8, 0.44, 0.8)
	style_g_drop.set_border_width_all(2)
	style_g_drop.set_corner_radius_all(4)
	style_g_drop.shadow_color = Color(0.18, 0.8, 0.44, 0.2)
	style_g_drop.shadow_size = 4
	garage_dropdown.add_theme_stylebox_override("panel", style_g_drop)
	
	# Style SupportDropdown
	var style_s_drop = StyleBoxFlat.new()
	style_s_drop.bg_color = Color(0.04, 0.07, 0.09, 0.95)
	style_s_drop.border_color = Color(0.3, 0.85, 1.0, 0.8)
	style_s_drop.set_border_width_all(2)
	style_s_drop.set_corner_radius_all(4)
	style_s_drop.shadow_color = Color(0.3, 0.85, 1.0, 0.2)
	style_s_drop.shadow_size = 4
	support_dropdown.add_theme_stylebox_override("panel", style_s_drop)
	
	# Style Dropdown Inner Buttons
	var btn_names = [
		"%GarageManagerBtn", "%PartsShopBtn",
		"%EmergencyRecoveryBtn", "%FactoryShowroomBtn", "%RDTechTreeBtn"
	]
	for btn_name in btn_names:
		var btn = get_node(btn_name) as Button
		if btn:
			var btn_style = StyleBoxFlat.new()
			btn_style.bg_color = Color(0.0, 0.0, 0.0, 0.2)
			btn_style.set_border_width_all(1)
			btn_style.set_corner_radius_all(2)
			if "Garage" in btn_name or "Parts" in btn_name:
				btn_style.border_color = Color(0.18, 0.8, 0.44, 0.4)
			else:
				btn_style.border_color = Color(0.3, 0.85, 1.0, 0.4)
			btn.add_theme_stylebox_override("normal", btn_style)
			btn.add_theme_stylebox_override("hover", btn_style)
			btn.add_theme_stylebox_override("pressed", btn_style)
			
	# Style SurchargeWarning banner
	var style_warning = StyleBoxFlat.new()
	style_warning.bg_color = Color(0.12, 0.06, 0.02, 0.9)
	style_warning.border_color = Color(1.0, 0.6, 0.1, 0.8)
	style_warning.set_border_width_all(2)
	style_warning.set_corner_radius_all(4)
	style_warning.shadow_color = Color(1.0, 0.6, 0.1, 0.2)
	style_warning.shadow_size = 4
	surcharge_warning.add_theme_stylebox_override("panel", style_warning)
	
	# Style RouteInfoPanel (formerly separate)
	var style_route = StyleBoxFlat.new()
	style_route.bg_color = Color(0.04, 0.05, 0.06, 0.5)
	style_route.border_color = Color(0.3, 0.85, 1.0, 0.15)
	style_route.set_border_width_all(1)
	style_route.set_corner_radius_all(3)
	route_info_panel.add_theme_stylebox_override("panel", style_route)

	# BackMenuBtn Normal/Hover/Pressed styled states
	var style_btn_normal = StyleBoxFlat.new()
	style_btn_normal.bg_color = Color(0.12, 0.04, 0.04, 0.6)
	style_btn_normal.border_color = Color(0.95, 0.15, 0.15, 0.6) # high-contrast warning red
	style_btn_normal.set_border_width_all(2)
	style_btn_normal.set_corner_radius_all(4)
	style_btn_normal.shadow_color = Color(0.95, 0.15, 0.15, 0.15) # soft red hazard dropshadow
	style_btn_normal.shadow_size = 4
	
	var style_btn_hover = StyleBoxFlat.new()
	style_btn_hover.bg_color = Color(0.24, 0.05, 0.05, 0.85)
	style_btn_hover.border_color = Color(0.95, 0.15, 0.15, 1.0) # vibrant full warning red
	style_btn_hover.set_border_width_all(2)
	style_btn_hover.set_corner_radius_all(4)
	style_btn_hover.shadow_color = Color(0.95, 0.15, 0.15, 0.45) # immediate intense red hover glow
	style_btn_hover.shadow_size = 8
	
	var style_btn_pressed = StyleBoxFlat.new()
	style_btn_pressed.bg_color = Color(0.15, 0.02, 0.02, 0.9)
	style_btn_pressed.border_color = Color(0.95, 0.15, 0.15, 0.8)
	style_btn_pressed.set_border_width_all(2)
	style_btn_pressed.set_corner_radius_all(4)
	style_btn_pressed.shadow_color = Color(0.95, 0.15, 0.15, 0.25)
	style_btn_pressed.shadow_size = 4
	
	back_menu_btn.add_theme_stylebox_override("normal", style_btn_normal)
	back_menu_btn.add_theme_stylebox_override("hover", style_btn_hover)
	back_menu_btn.add_theme_stylebox_override("pressed", style_btn_pressed)
	back_menu_btn.add_theme_color_override("font_color", Color(0.95, 0.25, 0.25, 1.0))
	back_menu_btn.add_theme_color_override("font_hover_color", Color(1.0, 0.4, 0.4, 1.0))

func _sync_hud_data() -> void:
	player_name_lbl.text = GameState.username.to_upper()
	_on_balances_updated(GameState.legal_balance, GameState.black_market_balance)
	_on_reputation_updated(GameState.reputation_score, GameState.police_heat)

func _on_balances_updated(legal_cash: float, dirty_cash: float) -> void:
	legal_balance_lbl.text = "$%s" % String.num(legal_cash, 2)
	black_balance_lbl.text = "$%s" % String.num(dirty_cash, 2)

func _on_reputation_updated(score: int, heat: int) -> void:
	# Convert reputation to a 0.0-10.0 rating scale (e.g. 150 -> 7.5) with premium star representation
	var rep_rating = clamp(float(score) / 20.0, 0.0, 10.0)
	rep_val_lbl.text = "⭐ %.1f / 10.0" % rep_rating
	
	# Display police heat percentage
	heat_val_lbl.text = "%d%%" % heat
	
	# Smoothly interpolate color gradient towards neon warning red as heat value increases
	var heat_ratio = clamp(float(heat) / 100.0, 0.0, 1.0)
	var calm_color = Color(0.470588, 0.521569, 0.596078, 1.0) # Sleek grey-blue/slate
	var alert_color = Color(0.95, 0.15, 0.15, 1.0) # Hot vibrant warning red
	var current_color = calm_color.lerp(alert_color, heat_ratio)
	
	heat_val_lbl.add_theme_color_override("font_color", current_color)
	
	# Sync the matching 'POLICE HEAT:' text label color to match the percentage value gradient
	if heat_val_lbl.has_node("../Symbol"):
		var symbol_lbl = heat_val_lbl.get_node("../Symbol") as Label
		if symbol_lbl:
			symbol_lbl.add_theme_color_override("font_color", current_color)

func _on_network_status_changed(connected: bool) -> void:
	if connected:
		_log_console("Network Status: Connected to logistics server.", Color(0.180, 0.803, 0.443))
	else:
		_log_console("Network Status: DISCONNECTED. Watchdog retrying...", Color(0.901, 0.298, 0.235))

func _log_console(text: String, color: Color) -> void:
	console_lbl.text = text
	console_lbl.add_theme_color_override("font_color", color)

func _on_back_pressed() -> void:
	NetworkManager.disconnect_from_server()
	SceneTransition.change_scene_to_file("res://scenes/main_menu/MainMenu.tscn")

func _draw_aberrated_line(from: Vector2, to: Vector2, base_color: Color, width: float) -> void:
	var offset_val = 1.2 / camera.zoom.x
	map_drawer.draw_line(from - Vector2(offset_val, 0), to - Vector2(offset_val, 0), Color(1.0, 0.1, 0.1, base_color.a * 0.45), width, true)
	map_drawer.draw_line(from + Vector2(offset_val, 0), to + Vector2(offset_val, 0), Color(0.1, 0.3, 1.0, base_color.a * 0.45), width, true)
	map_drawer.draw_line(from, to, base_color, width, true)


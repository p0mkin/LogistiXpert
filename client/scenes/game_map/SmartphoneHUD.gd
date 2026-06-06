extends CanvasLayer
class_name SmartphoneHUD

signal app_opened(app_name: String)

var phone_container: Control
var is_open: bool = false
var slide_tween: Tween

const PHONE_WIDTH = 340
const PHONE_HEIGHT = 680
const PHONE_HIDDEN_Y = 800
const PHONE_VISIBLE_Y = 20

func _ready() -> void:
    self.layer = 100 # Always on top
    
    # Base phone container
    phone_container = Control.new()
    phone_container.custom_minimum_size = Vector2(PHONE_WIDTH, PHONE_HEIGHT)
    phone_container.position = Vector2(1280 - PHONE_WIDTH - 20, PHONE_HIDDEN_Y)
    add_child(phone_container)
    
    # Phone Body (Glassmorphism styling)
    var body = PanelContainer.new()
    body.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    var style = StyleBoxFlat.new()
    style.bg_color = Color(0.05, 0.06, 0.08, 0.95)
    style.border_color = Color(0.2, 0.8, 1.0, 0.6)
    style.border_width_left = 2
    style.border_width_right = 2
    style.border_width_top = 2
    style.border_width_bottom = 2
    style.set_corner_radius_all(24)
    style.shadow_color = Color(0.0, 0.5, 1.0, 0.15)
    style.shadow_size = 20
    body.add_theme_stylebox_override("panel", style)
    phone_container.add_child(body)
    
    var margin = MarginContainer.new()
    margin.add_theme_constant_override("margin_top", 40)
    margin.add_theme_constant_override("margin_bottom", 40)
    margin.add_theme_constant_override("margin_left", 20)
    margin.add_theme_constant_override("margin_right", 20)
    body.add_child(margin)
    
    var vbox = VBoxContainer.new()
    vbox.add_theme_constant_override("separation", 24)
    margin.add_child(vbox)
    
    # Header
    var header = Label.new()
    header.text = "13:37  |  5G 📶"
    header.add_theme_font_size_override("font_size", 14)
    header.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
    header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vbox.add_child(header)
    
    # Apps Grid
    var grid = GridContainer.new()
    grid.columns = 3
    grid.add_theme_constant_override("h_separation", 20)
    grid.add_theme_constant_override("v_separation", 30)
    grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
    grid.alignment = BoxContainer.ALIGNMENT_CENTER
    vbox.add_child(grid)
    
    var apps = [
        {"name": "Dispatch", "icon": "📦", "color": Color(0.2, 0.9, 0.7)},
        {"name": "Drivers", "icon": "🪪", "color": Color(0.9, 0.7, 0.2)},
        {"name": "Garage", "icon": "🔧", "color": Color(0.2, 0.7, 1.0)},
        {"name": "Chop Shop", "icon": "⚙️", "color": Color(0.9, 0.2, 0.2)},
        {"name": "HQ Staff", "icon": "👥", "color": Color(0.7, 0.5, 0.9)},
        {"name": "Underworld", "icon": "💀", "color": Color(1.0, 0.3, 0.3)},
        {"name": "Laundry", "icon": "🧼", "color": Color(0.8, 0.4, 1.0)},
        {"name": "Auction", "icon": "⚖️", "color": Color(0.9, 0.5, 0.2)},
        {"name": "Banking", "icon": "🏦", "color": Color(0.4, 0.9, 0.4)}
    ]
    
    for app in apps:
        var app_btn = _create_app_icon(app.name, app.icon, app.color)
        grid.add_child(app_btn)
    
    # Home Button
    var home_btn = Button.new()
    home_btn.text = "—"
    home_btn.custom_minimum_size = Vector2(100, 8)
    home_btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
    var home_style = StyleBoxFlat.new()
    home_style.bg_color = Color(1.0, 1.0, 1.0, 0.5)
    home_style.set_corner_radius_all(4)
    home_btn.add_theme_stylebox_override("normal", home_style)
    home_btn.pressed.connect(toggle_phone)
    vbox.add_child(home_btn)

func _create_app_icon(app_name: String, icon: String, col: Color) -> VBoxContainer:
    var v = VBoxContainer.new()
    var btn = Button.new()
    btn.text = icon
    btn.custom_minimum_size = Vector2(70, 70)
    btn.add_theme_font_size_override("font_size", 32)
    
    var st = StyleBoxFlat.new()
    st.bg_color = col * 0.2
    st.border_color = col * 0.8
    st.border_width_left = 2
    st.border_width_top = 2
    st.border_width_right = 2
    st.border_width_bottom = 2
    st.set_corner_radius_all(16)
    btn.add_theme_stylebox_override("normal", st)
    btn.add_theme_stylebox_override("hover", st)
    
    var hover_st = st.duplicate()
    hover_st.bg_color = col * 0.4
    btn.add_theme_stylebox_override("hover", hover_st)
    
    btn.pressed.connect(func(): _on_app_pressed(app_name))
    v.add_child(btn)
    
    var lbl = Label.new()
    lbl.text = app_name
    lbl.add_theme_font_size_override("font_size", 11)
    lbl.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
    lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    v.add_child(lbl)
    
    return v

func _on_app_pressed(app_name: String) -> void:
    if app_name == "Dispatch":
        SceneTransition.change_scene_to_file("res://scenes/dispatch/DispatchCenter.tscn")
    elif app_name == "HQ Staff":
        SceneTransition.change_scene_to_file("res://scenes/staff/StaffManager.tscn")
    elif app_name == "Drivers":
        var roster = DriverRoster.new()
        get_tree().current_scene.add_child(roster)
    elif app_name == "Chop Shop":
        var shop = ChopShop.new()
        get_tree().current_scene.add_child(shop)
    elif app_name == "Underworld":
        SceneTransition.change_scene_to_file("res://scenes/underworld/UnderworldDealer.tscn")
    elif app_name == "Laundry":
        SceneTransition.change_scene_to_file("res://scenes/laundry/LaundryFronts.tscn")
    elif app_name == "Auction":
        SceneTransition.change_scene_to_file("res://scenes/auction/AuctionHouse.tscn")
    elif app_name == "Banking":
        SceneTransition.change_scene_to_file("res://scenes/analytics/LogisticsAnalytics.tscn")

func toggle_phone() -> void:
    is_open = not is_open
    if slide_tween and slide_tween.is_valid():
        slide_tween.kill()
        
    slide_tween = create_tween().set_trans(Tween.TRANS_SPRING).set_ease(Tween.EASE_OUT)
    var target_y = PHONE_VISIBLE_Y if is_open else PHONE_HIDDEN_Y
    slide_tween.tween_property(phone_container, "position:y", target_y, 0.6)

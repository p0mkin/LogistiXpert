extends CanvasLayer
class_name DriverRoster

var panel: PanelContainer
var drivers_container: VBoxContainer

func _ready() -> void:
    self.layer = 90
    
    panel = PanelContainer.new()
    panel.custom_minimum_size = Vector2(800, 500)
    panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
    add_child(panel)
    
    var style = StyleBoxFlat.new()
    style.bg_color = Color(0.05, 0.06, 0.08, 0.95)
    style.border_color = Color(0.9, 0.7, 0.2, 0.6)
    style.border_width_left = 2
    style.border_width_right = 2
    style.border_width_top = 2
    style.border_width_bottom = 2
    style.set_corner_radius_all(12)
    panel.add_theme_stylebox_override("panel", style)
    
    var vbox = VBoxContainer.new()
    panel.add_child(vbox)
    
    var header = Label.new()
    header.text = "👥 DRIVER ROSTER & SYNDICATE OPERATIVES"
    header.add_theme_font_size_override("font_size", 18)
    header.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2))
    header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    vbox.add_child(header)
    
    var scroll = ScrollContainer.new()
    scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
    vbox.add_child(scroll)
    
    drivers_container = VBoxContainer.new()
    drivers_container.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    scroll.add_child(drivers_container)
    
    var hire_btn = Button.new()
    hire_btn.text = "HIRE NEW DRIVER ($2500)"
    hire_btn.custom_minimum_size = Vector2(300, 40)
    hire_btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
    var hire_st = StyleBoxFlat.new()
    hire_st.bg_color = Color(0.1, 0.4, 0.2, 0.8)
    hire_st.set_corner_radius_all(8)
    hire_btn.add_theme_stylebox_override("normal", hire_st)
    hire_btn.pressed.connect(_hire_driver)
    vbox.add_child(hire_btn)
    
    var close_btn = Button.new()
    close_btn.text = "CLOSE"
    close_btn.pressed.connect(queue_free)
    vbox.add_child(close_btn)
    
    _fetch_drivers()

func _fetch_drivers() -> void:
    var http = HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(func(_r, code, _h, body):
        if code == 200:
            var drivers = JSON.parse_string(body.get_string_from_utf8())
            _render_drivers(drivers)
        http.queue_free()
    )
    http.request(NetworkManager.HTTP_URL + "/driver", ["Authorization: Bearer " + GameState.auth_token])

func _hire_driver() -> void:
    var http = HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(func(_r, code, _h, body):
        if code == 200:
            _fetch_drivers()
        http.queue_free()
    )
    http.request(NetworkManager.HTTP_URL + "/driver/hire", ["Content-Type: application/json", "Authorization: Bearer " + GameState.auth_token], HTTPClient.METHOD_POST, "{}")

func _render_drivers(drivers: Array) -> void:
    for c in drivers_container.get_children():
        c.queue_free()
        
    for d in drivers:
        var card = PanelContainer.new()
        var st = StyleBoxFlat.new()
        st.bg_color = Color(0.1, 0.1, 0.12, 0.8)
        card.add_theme_stylebox_override("panel", st)
        drivers_container.add_child(card)
        
        var hb = HBoxContainer.new()
        card.add_child(hb)
        
        var info = Label.new()
        info.text = "👤 %s | Trait: %s\nCharisma: %d | Loyalty: %d | Fatigue: %d%%" % [
            d.name, d.trait, d.charisma, d.loyalty, d.fatigue
        ]
        info.add_theme_font_size_override("font_size", 14)
        hb.add_child(info)

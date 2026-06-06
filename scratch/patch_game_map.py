import os

file_path = 'client/scenes/game_map/GameMap.gd'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """\t\t\t\telse:
\t\t\t\t\tvar line_color = Color(0.0, 0.85, 1.0, 0.35) # cyan legal routes
\t\t\t\t\tvar route_width = 1.5 / zoom
\t\t\t\t\t
\t\t\t\t\tvar conn_type = conn.get("type", "legal")
\t\t\t\t\tif conn_type == "underworld":
\t\t\t\t\t\tline_color = Color(0.92, 0.45, 0.15, 0.35) # underworld orange
\t\t\t\t\t\t
\t\t\t\t\tif is_selected_conn:
\t\t\t\t\t\tline_color.a = 0.7
\t\t\t\t\t\troute_width = 2.0 / zoom
\t\t\t\t\t\t
\t\t\t\t\t_draw_aberrated_line(start_pos, end_pos, line_color, route_width)"""

new_logic = """\t\t\t\telse:
\t\t\t\t\tvar is_tunnel = (city_id == "london" and conn_id == "paris") or (city_id == "paris" and conn_id == "london")
\t\t\t\t\tvar sea_routes = ["stockholm_tallinn", "stockholm_gdansk", "helsinki_tallinn", "turku_stockholm", "stockholm_turku", "visby_stockholm", "visby_riga", "visby_klaipeda", "oslo_copenhagen", "stockholm_oslo"]
\t\t\t\t\tvar is_sea_route = sea_routes.has(city_id + "_" + conn_id) or sea_routes.has(conn_id + "_" + city_id)
\t\t\t\t\tvar fuel_routes = ["istanbul_ankara", "ankara_tehran", "tehran_kabul", "ankara_baghdad", "baghdad_riyadh", "riyadh_dubai", "tehran_dubai"]
\t\t\t\t\tvar is_fuel_route = fuel_routes.has(city_id + "_" + conn_id) or fuel_routes.has(conn_id + "_" + city_id)

\t\t\t\t\tvar line_color = Color(0.0, 0.85, 1.0, 0.35) # cyan legal routes
\t\t\t\t\tvar route_width = 1.5 / zoom
\t\t\t\t\tvar is_dashed = false
\t\t\t\t\tvar dash_l = 6.0 / zoom
\t\t\t\t\tvar gap_l = 4.0 / zoom
\t\t\t\t\tvar dash_anim = 0.0

\t\t\t\t\tvar conn_type = conn.get("type", "legal")
\t\t\t\t\tif conn_type == "underworld":
\t\t\t\t\t\tline_color = Color(0.92, 0.45, 0.15, 0.35) # underworld orange
\t\t\t\t\t\t
\t\t\t\t\tif is_tunnel:
\t\t\t\t\t\tline_color = Color(0.78, 0.20, 1.0, 0.6) # Neon purple
\t\t\t\t\t\tis_dashed = true
\t\t\t\t\t\tdash_l = 10.0 / zoom
\t\t\t\t\t\tgap_l = 5.0 / zoom
\t\t\t\t\telif is_sea_route:
\t\t\t\t\t\tline_color = Color(0.0, 0.90, 1.0, 0.5) # Neon blue
\t\t\t\t\t\tis_dashed = true
\t\t\t\t\t\tdash_l = 4.0 / zoom
\t\t\t\t\t\tgap_l = 6.0 / zoom
\t\t\t\t\telif is_fuel_route:
\t\t\t\t\t\tline_color = Color(1.0, 0.84, 0.0, 0.7) # Glowing gold
\t\t\t\t\t\tis_dashed = true
\t\t\t\t\t\tdash_l = 15.0 / zoom
\t\t\t\t\t\tgap_l = 5.0 / zoom
\t\t\t\t\t\tdash_anim = time_passed * 15.0 # steady flow animation
\t\t\t\t\t\t
\t\t\t\t\tif is_selected_conn:
\t\t\t\t\t\tline_color.a = 0.7
\t\t\t\t\t\troute_width = 2.0 / zoom
\t\t\t\t\t\tif is_fuel_route:
\t\t\t\t\t\t\troute_width = 3.5 / zoom
\t\t\t\t\t\t\tline_color = Color(1.0, 0.84, 0.0, 0.9)
\t\t\t\t\t\t
\t\t\t\t\tif is_dashed:
\t\t\t\t\t\t_draw_dashed_line(start_pos, end_pos, line_color, route_width, dash_l, gap_l, dash_anim)
\t\t\t\t\telse:
\t\t\t\t\t\t_draw_aberrated_line(start_pos, end_pos, line_color, route_width)"""

if old_logic in content:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content.replace(old_logic, new_logic))
    print('Successfully patched GameMap.gd drawing logic.')
else:
    print('Failed to find target string in GameMap.gd.')

import os

file_path = 'client/scenes/game_map/GameMap.gd'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """var map_min_lat: float = 48.0
var map_max_lat: float = 61.5
var map_min_lon: float = 9.5
var map_max_lon: float = 31.5"""

new_logic = """var map_min_lat: float = 20.0
var map_max_lat: float = 68.0
var map_min_lon: float = -6.0
var map_max_lon: float = 72.0"""

if old_logic in content:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content.replace(old_logic, new_logic))
    print('Successfully patched GameMap.gd bounds.')
else:
    print('Failed to find target string in GameMap.gd for bounds.')

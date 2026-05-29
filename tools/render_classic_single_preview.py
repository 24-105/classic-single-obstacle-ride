from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "assets" / "models" / "classic_single_rider.glb"
OUT_DIR = Path("/private/tmp")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 96
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium High Contrast"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.color = (0.82, 0.86, 0.86)


def import_model():
    bpy.ops.import_scene.gltf(filepath=str(MODEL))
    imported = [obj for obj in bpy.context.scene.objects if obj.type in {"MESH", "EMPTY"}]
    for obj in imported:
        obj.select_set(True)
    return imported


def add_studio():
    bpy.ops.mesh.primitive_plane_add(size=7.0, location=(0, 0, -0.02))
    floor = bpy.context.object
    floor.name = "matte_studio_floor"
    mat = bpy.data.materials.new("warm light floor")
    mat.diffuse_color = (0.74, 0.76, 0.74, 1)
    floor.data.materials.append(mat)

    for name, loc, energy, size in [
        ("large softbox left", (-3.5, -4.0, 4.5), 520, 4.0),
        ("front chrome kicker", (3.6, -3.0, 2.5), 190, 2.2),
        ("top strip light", (0, 1.7, 4.4), 260, 3.0),
    ]:
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = loc


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_view(filename, location, target, ortho_scale):
    camera_data = bpy.data.cameras.new(filename + "_camera")
    camera = bpy.data.objects.new(filename + "_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = Vector(location)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ortho_scale
    look_at(camera, target)
    bpy.context.scene.camera = camera
    bpy.context.scene.render.filepath = str(OUT_DIR / filename)
    bpy.ops.render.render(write_still=True)


def main():
    clear_scene()
    configure_render()
    import_model()
    add_studio()
    render_view("classic-single-side-render.png", (4.9, -0.04, 1.58), (0, -0.04, 1.35), 3.35)
    render_view("classic-single-front-render.png", (0, -4.65, 1.72), (0, -0.62, 1.36), 3.0)


if __name__ == "__main__":
    main()

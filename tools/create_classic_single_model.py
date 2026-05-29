from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "models" / "classic_single_rider.glb"
BIKE_WIDTH_SCALE = 0.76
RIDER_OFFSET = (0, 0.11, 0.08)
ADD_RIDER_SURFACE_SEAMS = False


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def hex_to_rgba(value, alpha=1.0):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)) + (alpha,)


def material(name, color, roughness=0.55, metallic=0.0, alpha=1.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = hex_to_rgba(color, alpha)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
        for input_name in ("Coat Weight", "Clearcoat"):
            if input_name in bsdf.inputs:
                bsdf.inputs[input_name].default_value = coat
        for input_name in ("Coat Roughness", "Clearcoat Roughness"):
            if input_name in bsdf.inputs:
                bsdf.inputs[input_name].default_value = 0.16
    if alpha < 1:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
        mat.show_transparent_back = True
    return mat


MATS = {
    "rubber": material("deep tire rubber", "#050609", 0.72, 0.02),
    "sidewall": material("soft black sidewall", "#11151b", 0.84, 0.02),
    "chrome": material("bright browser chrome", "#f7fbfc", 0.2, 0.62),
    "rim": material("brushed alloy rim", "#e5ebee", 0.28, 0.56),
    "spoke": material("thin stainless spokes", "#f8faf9", 0.24, 0.42),
    "frame": material("black tubular frame", "#12151a", 0.42, 0.55),
    "tank": material("dark gray metallic tank", "#282e33", 0.34, 0.44, coat=0.58),
    "tank_dark": material("charcoal tank shadow", "#151a1f", 0.38, 0.32, coat=0.28),
    "tank_panel": material("silver gray tank scallop", "#aeb5b6", 0.32, 0.32, coat=0.42),
    "tank_pin_black": material("black tank scallop outline", "#080b0e", 0.28, 0.24, coat=0.45),
    "tank_silver": material("soft silver tank pinstripe", "#cbd0ce", 0.32, 0.34),
    "tank_panel_shadow": material("shadow under tank side graphic", "#3c4348", 0.36, 0.22, 0.82, coat=0.25),
    "paint_highlight": material("soft paint reflection highlight", "#aeb7b7", 0.34, 0.06, 0.32),
    "stripe": material("warm tank stripe", "#e8dfc8", 0.36, 0.12),
    "cream": material("aged cream graphics", "#efe8d2", 0.4, 0.08),
    "engine": material("cast aluminum engine", "#8f9698", 0.42, 0.7),
    "engine_bright": material("fresh polished engine fin edge", "#d4dbdc", 0.22, 0.84),
    "engine_dark": material("shadowed engine fins", "#181b20", 0.42, 0.72),
    "case_shadow": material("deep case cavity shadow", "#0c0e11", 0.55, 0.28),
    "road_dust": material("soft road dust", "#6d675c", 0.82, 0.0, 0.42),
    "oil_stain": material("thin oil stain", "#050607", 0.62, 0.05, 0.5),
    "rubber_emboss": material("raised tire sidewall emboss", "#20252a", 0.86, 0.01),
    "leather": material("black leather seat", "#101216", 0.5, 0.08),
    "stitch": material("seat stitch thread", "#d8d0bd", 0.64, 0.0),
    "glass": material("headlight glass", "#dff7ff", 0.08, 0.08, 0.72),
    "mirror_glass": material("dark mirror glass", "#101a20", 0.06, 0.22, 0.82),
    "amber": material("amber signal lens", "#f0a33b", 0.24, 0.08),
    "red": material("red brake lens", "#d72f38", 0.28, 0.06),
    "jacket": material("armored riding jacket", "#24292f", 0.58, 0.08),
    "jacket_panel": material("matte jacket panel", "#343a42", 0.52, 0.12),
    "jacket_shadow": material("deep jacket seam shadow", "#15191f", 0.62, 0.05),
    "denim": material("dark denim pants", "#263948", 0.7, 0.03),
    "denim_highlight": material("worn denim edge", "#405769", 0.76, 0.02),
    "denim_shadow": material("denim seam shadow", "#192532", 0.72, 0.02),
    "glove": material("black riding gloves", "#0a0c0f", 0.48, 0.08),
    "boot": material("black riding boots", "#08090c", 0.54, 0.12),
    "helmet": material("gloss black helmet", "#101218", 0.22, 0.48),
    "visor": material("smoked visor", "#08141d", 0.08, 0.3, 0.66),
    "skin": material("warm skin", "#c58a66", 0.64, 0.01),
}


def set_parent(obj, parent):
    if parent is None:
        return obj
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def smooth(obj):
    if not hasattr(obj.data, "polygons"):
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    obj.select_set(False)
    return obj


def add_material(obj, mat):
    obj.data.materials.append(mat)
    return obj


def bevel(obj, width=0.03, segments=5):
    mod = obj.modifiers.new("soft bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.affect = "EDGES"
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def cube(name, loc, scale, mat, parent=None, rotation=(0, 0, 0), bevel_width=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    add_material(obj, mat)
    if bevel_width:
        bevel(obj, bevel_width)
    set_parent(obj, parent)
    return obj


def sphere(name, loc, scale, mat, parent=None, segments=64, rings=32, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    add_material(obj, mat)
    smooth(obj)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    set_parent(obj, parent)
    return obj


def flattened_sphere(name, loc, scale, mat, parent=None, segments=80, rings=40, rotation=(0, 0, 0)):
    obj = sphere(name, loc, scale, mat, parent=parent, segments=segments, rings=rings, rotation=rotation)
    obj.modifiers.new("subtle subdivision", "SUBSURF").levels = 1
    return obj


def cylinder(name, loc, radius, depth, mat, parent=None, vertices=96, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    add_material(obj, mat)
    smooth(obj)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    set_parent(obj, parent)
    return obj


def elliptical_cylinder(name, loc, radius_x, radius_y, depth, mat, parent=None, vertices=96, rotation=(0, 0, 0)):
    obj = cylinder(name, loc, 1, depth, mat, parent=None, vertices=vertices, rotation=rotation)
    obj.scale.x = radius_x
    obj.scale.y = radius_y
    set_parent(obj, parent)
    return obj


def torus(name, loc, major, minor, mat, parent=None, rotation=(0, math.pi / 2, 0), major_segments=192, minor_segments=28):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=major_segments,
        minor_segments=minor_segments,
        major_radius=major,
        minor_radius=minor,
        location=loc,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    add_material(obj, mat)
    smooth(obj)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    set_parent(obj, parent)
    return obj


def tube_between(name, start, end, radius, mat, parent=None, vertices=32):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    length = direction.length
    midpoint = start + direction * 0.5
    obj = cylinder(name, midpoint, radius, length, mat, parent=None, vertices=vertices)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    set_parent(obj, parent)
    return obj


def capsule_between(name, start, end, radius, mat, parent=None, vertices=32):
    group = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(group)
    set_parent(group, parent)
    tube_between(name + "_tube", start, end, radius, mat, parent=group, vertices=vertices)
    sphere(name + "_cap_a", start, (radius, radius, radius), mat, parent=group, segments=vertices, rings=16)
    sphere(name + "_cap_b", end, (radius, radius, radius), mat, parent=group, segments=vertices, rings=16)
    return group


def curve_tube(name, points, radius, mat, parent=None, resolution=4):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = radius
    curve.bevel_resolution = 5
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    set_parent(obj, parent)
    return obj


def arc_points(center, radius, start_angle, end_angle, count=42):
    points = []
    for i in range(count):
        t = i / (count - 1)
        angle = start_angle + (end_angle - start_angle) * t
        points.append((center[0], center[1] + math.sin(angle) * radius, center[2] + math.cos(angle) * radius))
    return points


def make_root():
    root = bpy.data.objects.new("Classic_Single_Rider_BlenderGLB", None)
    bpy.context.collection.objects.link(root)
    return root


def make_group(name, parent=None, loc=(0, 0, 0), scale=(1, 1, 1)):
    group = bpy.data.objects.new(name, None)
    group.location = loc
    group.scale = scale
    bpy.context.collection.objects.link(group)
    set_parent(group, parent)
    return group


def mesh_object(name, verts, faces, mat, parent=None, smooth_mesh=True):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if smooth_mesh:
        smooth(obj)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    set_parent(obj, parent)
    return obj


def bolt_circle(prefix, x, y, z, radius_y, radius_z, count, parent, radius=0.012):
    for i in range(count):
        angle = (i / count) * math.tau
        cylinder(
            f"{prefix}_bolt_{i:02d}",
            (x, y + math.cos(angle) * radius_y, z + math.sin(angle) * radius_z),
            radius,
            0.006,
            MATS["chrome"],
            parent,
            vertices=20,
            rotation=(0, math.pi / 2, 0),
        )


def teardrop_tank(parent):
    # The tank is not a sphere: it is a slim teardrop with a rounded front,
    # a low rear taper into the seat, and shallow knee panels on both sides.
    rings = 44
    sections = [
        (-1.1, 0.07, 1.41, 0.07),
        (-0.94, 0.33, 1.5, 0.18),
        (-0.7, 0.56, 1.55, 0.28),
        (-0.42, 0.64, 1.54, 0.31),
        (-0.11, 0.58, 1.5, 0.275),
        (0.18, 0.41, 1.43, 0.195),
        (0.43, 0.17, 1.35, 0.09),
        (0.58, 0.055, 1.305, 0.038),
    ]
    verts = []
    for y, half_width, center_z, radius_z in sections:
        for i in range(rings):
            angle = (i / rings) * math.tau
            cos_v = math.cos(angle)
            sin_v = math.sin(angle)
            top_flatten = 1.0 - 0.19 * max(sin_v, 0)
            lower_bulge = 1.0 + 0.1 * max(-sin_v, 0)
            shoulder = top_flatten * lower_bulge
            verts.append((half_width * cos_v * shoulder, y, center_z + radius_z * sin_v))

    faces = []
    for section_index in range(len(sections) - 1):
        offset = section_index * rings
        next_offset = (section_index + 1) * rings
        for i in range(rings):
            faces.append((offset + i, offset + (i + 1) % rings, next_offset + (i + 1) % rings, next_offset + i))
    faces.append(tuple(reversed(range(rings))))
    end = (len(sections) - 1) * rings
    faces.append(tuple(end + i for i in range(rings)))

    tank = mesh_object("classic_single_teardrop_tank", verts, faces, MATS["tank"], parent)
    tank.modifiers.new("tank fine subdivision", "SUBSURF").levels = 1
    cylinder("chrome_fuel_cap_low_profile", (0, -0.43, 1.798), 0.092, 0.02, MATS["chrome"], parent, vertices=96)
    cylinder("fuel_cap_dark_center", (0, -0.43, 1.812), 0.052, 0.007, MATS["tank_dark"], parent, vertices=64)
    curve_tube("tank_center_highlight_pinstripe", [(0, -0.92, 1.68), (0, -0.42, 1.795), (0, 0.2, 1.61)], 0.0065, MATS["tank_silver"], parent)
    curve_tube("tank_top_soft_crease_left", [(-0.12, -0.86, 1.63), (-0.22, -0.43, 1.69), (-0.16, 0.16, 1.52)], 0.0042, MATS["paint_highlight"], parent)
    curve_tube("tank_top_soft_crease_right", [(0.12, -0.86, 1.63), (0.22, -0.43, 1.69), (0.16, 0.16, 1.52)], 0.0042, MATS["paint_highlight"], parent)
    curve_tube("tank_front_lower_black_lip", [(-0.23, -1.03, 1.38), (0, -1.11, 1.37), (0.23, -1.03, 1.38)], 0.012, MATS["tank_dark"], parent)
    cube("tank_rear_mount_shadow_under_seat", (0, 0.5, 1.31), (0.34, 0.08, 0.035), MATS["case_shadow"], parent, bevel_width=0.01)
    for side in (-1, 1):
        curve_tube(
            f"tank_soft_upper_reflection_{side}",
            [(side * 0.17, -0.86, 1.65), (side * 0.39, -0.43, 1.7), (side * 0.25, 0.1, 1.55)],
            0.01,
            MATS["paint_highlight"],
            parent,
        )
        curve_tube(
            f"tank_lower_belly_reflection_{side}",
            [(side * 0.28, -0.78, 1.38), (side * 0.5, -0.3, 1.33), (side * 0.35, 0.18, 1.32)],
            0.005,
            MATS["paint_highlight"],
            parent,
        )
        curve_tube(
            f"tank_lower_black_crimp_seam_{side}",
            [(side * 0.5, -0.74, 1.315), (side * 0.54, -0.22, 1.27), (side * 0.28, 0.44, 1.255)],
            0.006,
            MATS["tank_pin_black"],
            parent,
        )
    curve_tube("tank_lower_left_chrome_seam", [(-0.34, -0.95, 1.34), (-0.53, -0.28, 1.29), (-0.3, 0.42, 1.25)], 0.005, MATS["chrome"], parent)
    curve_tube("tank_lower_right_chrome_seam", [(0.34, -0.95, 1.34), (0.53, -0.28, 1.29), (0.3, 0.42, 1.25)], 0.005, MATS["chrome"], parent)
    cube("tank_black_underside_tunnel", (0, -0.08, 1.235), (0.48, 0.92, 0.055), MATS["tank_dark"], parent, bevel_width=0.024)
    curve_tube("tank_left_lower_dark_shadow", [(-0.42, -0.92, 1.34), (-0.56, -0.23, 1.28), (-0.34, 0.39, 1.245)], 0.012, MATS["tank_dark"], parent)
    curve_tube("tank_right_lower_dark_shadow", [(0.42, -0.92, 1.34), (0.56, -0.23, 1.28), (0.34, 0.39, 1.245)], 0.012, MATS["tank_dark"], parent)

    for side in (-1, 1):
        flattened_sphere(
            f"tank_knee_recess_shadow_{side}",
            (side * 0.555, -0.08, 1.39),
            (0.018, 0.31, 0.105),
            MATS["tank_dark"],
            parent,
            segments=56,
            rings=24,
        )
        tank_side_graphics(side, parent)


def tank_side_graphics(side, parent):
    x = side * 0.602
    panel_points = [
        (-0.91, 1.43),
        (-0.75, 1.53),
        (-0.49, 1.585),
        (-0.21, 1.565),
        (0.02, 1.49),
        (0.14, 1.41),
        (0.03, 1.345),
        (-0.31, 1.304),
        (-0.66, 1.335),
        (-0.85, 1.39),
    ]
    inner_points = [
        (-0.72, 1.452),
        (-0.52, 1.508),
        (-0.26, 1.525),
        (-0.05, 1.47),
        (-0.12, 1.405),
        (-0.42, 1.372),
        (-0.65, 1.392),
    ]
    lower_shadow_points = [
        (-0.76, 1.39),
        (-0.49, 1.405),
        (-0.19, 1.382),
        (0.03, 1.35),
        (-0.1, 1.325),
        (-0.43, 1.315),
        (-0.69, 1.345),
    ]

    def panel(name, points, mat, x_offset):
        verts = [(x_offset, y, z) for y, z in points]
        faces = [tuple(range(len(points)))]
        obj = mesh_object(name, verts, faces, mat, parent, smooth_mesh=False)
        obj.rotation_euler[1] = math.radians(2.5) * -side
        return obj

    panel(f"tank_side_silver_factory_scallop_{side}", panel_points, MATS["tank_panel"], x)
    panel(f"tank_side_soft_reflection_inset_{side}", inner_points, MATS["paint_highlight"], side * 0.608)
    panel(f"tank_side_lower_body_shadow_{side}", lower_shadow_points, MATS["tank_panel_shadow"], side * 0.612)
    outline = [(side * 0.617, y, z) for y, z in panel_points + [panel_points[0]]]
    curve_tube(f"tank_outer_black_scallop_outline_{side}", outline, 0.0105, MATS["tank_pin_black"], parent)
    curve_tube(f"tank_outer_silver_pinstripe_{side}", outline, 0.0038, MATS["stripe"], parent)
    inner_outline = [(side * 0.622, y, z) for y, z in inner_points + [inner_points[0]]]
    curve_tube(f"tank_inner_hairline_pinstripe_{side}", inner_outline, 0.0026, MATS["tank_silver"], parent)
    curve_tube(
        f"tank_side_lower_silver_sweep_{side}",
        [(side * 0.619, -0.82, 1.375), (side * 0.626, -0.36, 1.315), (side * 0.598, 0.1, 1.365)],
        0.0042,
        MATS["tank_pin_black"],
        parent,
    )
    tuning_fork_mark(side, parent)
    for y, z in [(-0.8, 1.43), (0.1, 1.4)]:
        cylinder(
            f"tank_graphic_trim_screw_{side}_{y}",
            (side * 0.626, y, z),
            0.01,
            0.006,
            MATS["chrome"],
            parent,
            vertices=20,
            rotation=(0, math.pi / 2, 0),
        )


def tuning_fork_mark(side, parent):
    x = side * 0.64
    center_y = -0.65
    center_z = 1.57
    torus(
        f"tank_tuning_fork_outer_ring_{side}",
        (x, center_y, center_z),
        0.059,
        0.0045,
        MATS["tank_pin_black"],
        parent,
        rotation=(0, math.pi / 2, 0),
        major_segments=64,
        minor_segments=8,
    )
    cylinder(f"tank_tuning_fork_light_disc_{side}", (side * 0.631, center_y, center_z), 0.05, 0.004, MATS["cream"], parent, vertices=64, rotation=(0, math.pi / 2, 0))
    for index, angle in enumerate((math.radians(90), math.radians(210), math.radians(330))):
        dy = math.cos(angle) * 0.04
        dz = math.sin(angle) * 0.04
        curve_tube(
            f"tank_tuning_fork_spoke_{side}_{index}",
            [(side * 0.644, center_y, center_z), (side * 0.644, center_y + dy, center_z + dz)],
            0.003,
            MATS["frame"],
            parent,
        )
        flattened_sphere(
            f"tank_tuning_fork_tip_{side}_{index}",
            (side * 0.646, center_y + dy, center_z + dz),
            (0.006, 0.011, 0.011),
            MATS["frame"],
            parent,
            segments=20,
            rings=10,
        )
    cylinder(f"tank_tuning_fork_center_{side}", (side * 0.647, center_y, center_z), 0.01, 0.006, MATS["frame"], parent, vertices=28, rotation=(0, math.pi / 2, 0))


def side_cover(side, parent):
    x = side * 0.47
    points = [
        (0.04, 0.94),
        (0.24, 1.2),
        (0.72, 1.17),
        (0.84, 1.0),
        (0.7, 0.83),
        (0.18, 0.82),
    ]
    verts = [(x, y, z) for y, z in points]
    cover = mesh_object(f"sr_side_cover_trapezoid_{side}", verts, [tuple(range(len(verts)))], MATS["tank_dark"], parent, smooth_mesh=False)
    solid = cover.modifiers.new("side cover thickness", "SOLIDIFY")
    solid.thickness = 0.035
    solid.offset = side
    bevel(cover, 0.018, 4)
    outline = [(side * 0.515, y, z) for y, z in points + [points[0]]]
    curve_tube(f"sr_side_cover_chrome_outline_{side}", outline, 0.006, MATS["chrome"], parent)
    curve_tube(f"sr_side_cover_soft_upper_reflection_{side}", [(side * 0.517, 0.18, 1.13), (side * 0.522, 0.48, 1.16), (side * 0.516, 0.77, 1.09)], 0.0038, MATS["paint_highlight"], parent)
    cube(f"sr_side_cover_badge_plate_{side}", (side * 0.495, 0.38, 1.02), (0.012, 0.24, 0.075), MATS["cream"], parent, bevel_width=0.012)
    for y, z in ((0.11, 0.95), (0.76, 1.02)):
        cylinder(
            f"side_cover_phillips_screw_{side}_{y}",
            (side * 0.522, y, z),
            0.014,
            0.006,
            MATS["chrome"],
            parent,
            vertices=22,
            rotation=(0, math.pi / 2, 0),
        )
        cube(
            f"side_cover_screw_slot_{side}_{y}",
            (side * 0.527, y, z),
            (0.004, 0.018, 0.0025),
            MATS["case_shadow"],
            parent,
            rotation=(0, 0, side * 0.4),
            bevel_width=0.0008,
        )
    for i in range(4):
        cube(
            f"sr_side_cover_lower_louver_{side}_{i}",
            (side * 0.505, 0.34 + i * 0.055, 0.88),
            (0.012, 0.17, 0.012),
            MATS["chrome"],
            parent,
            bevel_width=0.004,
        )


def create_engine_unit(parent):
    # A layered air-cooled single: round crank covers, vertical fin stack,
    # dark gaps, oil lines, and the chrome header flowing down the right side.
    flattened_sphere("right_crankcase_round_cover", (0.395, -0.04, 0.78), (0.08, 0.31, 0.28), MATS["chrome"], parent, segments=112, rings=48)
    flattened_sphere("right_crankcase_inner_circle", (0.452, -0.04, 0.78), (0.022, 0.23, 0.2), MATS["engine"], parent, segments=88, rings=32)
    flattened_sphere("left_crankcase_round_cover", (-0.395, -0.04, 0.78), (0.08, 0.29, 0.25), MATS["chrome"], parent, segments=112, rings=48)
    for side in (-1, 1):
        torus(
            f"crankcase_polished_outer_bead_{side}",
            (side * 0.462, -0.04, 0.78),
            0.225,
            0.007,
            MATS["chrome"],
            parent,
            rotation=(0, math.pi / 2, 0),
            major_segments=80,
            minor_segments=10,
        )
        torus(
            f"crankcase_inner_dark_gasket_{side}",
            (side * 0.468, -0.04, 0.78),
            0.155,
            0.0045,
            MATS["engine_dark"],
            parent,
            rotation=(0, math.pi / 2, 0),
            major_segments=72,
            minor_segments=8,
        )
    flattened_sphere("lower_crankcase_body", (0, -0.02, 0.74), (0.43, 0.32, 0.2), MATS["engine"], parent, segments=112, rings=48)
    flattened_sphere("timing_cover_small_round", (0.43, 0.22, 0.68), (0.055, 0.16, 0.14), MATS["chrome"], parent, segments=64, rings=28)
    flattened_sphere("oil_filter_bulge", (0.38, -0.3, 0.73), (0.05, 0.12, 0.1), MATS["engine"], parent, segments=56, rings=24)
    flattened_sphere("right_lower_polished_case_lobe", (0.48, -0.2, 0.63), (0.04, 0.17, 0.135), MATS["chrome"], parent, segments=64, rings=28)
    flattened_sphere("right_kickstart_shaft_boss", (0.5, 0.14, 0.93), (0.03, 0.08, 0.075), MATS["engine_bright"], parent, segments=48, rings=20)
    flattened_sphere("right_front_cam_cover_polished", (0.49, -0.34, 0.94), (0.035, 0.105, 0.095), MATS["chrome"], parent, segments=64, rings=28)
    torus(
        "right_front_cam_cover_dark_gasket",
        (0.512, -0.34, 0.94),
        0.075,
        0.0038,
        MATS["engine_dark"],
        parent,
        rotation=(0, math.pi / 2, 0),
        major_segments=56,
        minor_segments=8,
    )
    flattened_sphere("right_lower_oil_pump_cap", (0.505, 0.08, 0.62), (0.028, 0.07, 0.058), MATS["engine_bright"], parent, segments=44, rings=20)
    bolt_circle("right_front_cam_cover", 0.515, -0.34, 0.94, 0.073, 0.064, 6, parent, radius=0.007)
    cube("lower_case_horizontal_split_line", (0.47, -0.03, 0.765), (0.012, 0.49, 0.006), MATS["engine_dark"], parent, bevel_width=0.001)
    cube("right_case_lower_flat_shadow", (0.488, 0.035, 0.575), (0.012, 0.31, 0.028), MATS["case_shadow"], parent, bevel_width=0.004)
    cylinder("crankcase_oil_drain_bolt", (0.24, -0.22, 0.565), 0.018, 0.012, MATS["chrome"], parent, vertices=6, rotation=(math.pi / 2, 0, 0))
    cylinder("vertical_single_cylinder_core", (0, -0.16, 1.05), 0.205, 0.46, MATS["engine_dark"], parent, vertices=88)

    for i in range(22):
        z = 0.8 + i * 0.028
        width = 0.68 - abs(i - 10.5) * 0.012
        depth = 0.43 - abs(i - 10.5) * 0.006
        elliptical_cylinder(f"rounded_air_cooling_fin_{i:02d}", (0, -0.16, z), width * 0.5, depth * 0.5, 0.013, MATS["engine"], parent, vertices=96)
        cube(f"fin_front_flat_lip_{i:02d}", (0, -0.38, z + 0.004), (width * 0.9, 0.018, 0.018), MATS["engine"], parent, bevel_width=0.004)
        cube(f"fin_rear_flat_lip_{i:02d}", (0, 0.05, z + 0.004), (width * 0.72, 0.015, 0.016), MATS["engine"], parent, bevel_width=0.004)
        for side in (-1, 1):
            cube(
                f"visible_side_fin_bright_{side}_{i:02d}",
                (side * 0.365, -0.16, z + 0.006),
                (0.018, depth * 0.92, 0.015),
                MATS["chrome"] if i % 3 == 0 else MATS["engine"],
                parent,
                bevel_width=0.003,
            )
        if i % 2 == 0:
            elliptical_cylinder(f"fin_shadow_gap_{i:02d}", (0, -0.16, z - 0.012), width * 0.43, depth * 0.42, 0.005, MATS["engine_dark"], parent, vertices=80)
        for side in (-1, 1):
            cube(f"fin_side_cut_{side}_{i:02d}", (side * 0.33, -0.16, z), (0.018, 0.3, 0.01), MATS["engine_dark"], parent, bevel_width=0.002)

    for i in range(18):
        z = 0.835 + i * 0.031
        width = 0.53 - abs(i - 8.5) * 0.01
        cube(
            f"front_fin_black_air_gap_{i:02d}",
            (0, -0.405, z - 0.008),
            (width, 0.014, 0.006),
            MATS["case_shadow"],
            parent,
            bevel_width=0.001,
        )
        if i % 3 == 1:
            cube(
                f"front_fin_polished_edge_glint_{i:02d}",
                (0, -0.422, z + 0.004),
                (width * 0.82, 0.006, 0.006),
                MATS["engine_bright"],
                parent,
                bevel_width=0.001,
            )

    for x in (-0.21, 0.21):
        tube_between(
            f"front_visible_cylinder_tie_rod_{x}",
            (x, -0.432, 0.79),
            (x * 0.9, -0.405, 1.42),
            0.0065,
            MATS["chrome"],
            parent,
            vertices=14,
        )
        cylinder(
            f"front_visible_tie_rod_top_nut_{x}",
            (x * 0.9, -0.405, 1.445),
            0.02,
            0.014,
            MATS["chrome"],
            parent,
            vertices=6,
            rotation=(math.pi / 2, 0, 0),
        )

    for side in (-1, 1):
        for i in range(18):
            z = 0.84 + i * 0.031
            y_len = 0.43 - abs(i - 8.5) * 0.005
            cube(
                f"outer_visible_cylinder_fin_{side}_{i:02d}",
                (side * 0.505, -0.16, z),
                (0.016, y_len, 0.013),
                MATS["engine_bright"] if i % 2 == 0 else MATS["engine"],
                parent,
                bevel_width=0.0025,
            )
            cube(
                f"outer_fin_dark_split_{side}_{i:02d}",
                (side * 0.518, -0.16, z - 0.014),
                (0.009, y_len * 0.82, 0.005),
                MATS["engine_dark"],
                parent,
                bevel_width=0.001,
            )
        cube(f"cylinder_side_dark_vertical_slot_{side}", (side * 0.523, -0.35, 1.09), (0.012, 0.032, 0.43), MATS["engine_dark"], parent, bevel_width=0.003)
        cube(f"cylinder_side_bright_front_edge_{side}", (side * 0.515, -0.4, 1.09), (0.018, 0.024, 0.47), MATS["engine_bright"], parent, bevel_width=0.004)
        for y in (-0.32, 0.02):
            tube_between(
                f"polished_cylinder_stud_{side}_{y}",
                (side * 0.542, y, 0.78),
                (side * 0.542, y, 1.43),
                0.008,
                MATS["chrome"],
                parent,
                vertices=16,
            )
            cylinder(
                f"cylinder_stud_acorn_nut_{side}_{y}",
                (side * 0.546, y, 1.455),
                0.026,
                0.018,
                MATS["chrome"],
                parent,
                vertices=6,
                rotation=(0, math.pi / 2, 0),
            )
        for i in range(7):
            cube(
                f"deep_fin_shadow_pocket_{side}_{i}",
                (side * 0.548, -0.155, 0.89 + i * 0.075),
                (0.012, 0.36 - i * 0.012, 0.012),
                MATS["case_shadow"],
                parent,
                bevel_width=0.001,
            )

    cube("cylinder_head_box", (0, -0.16, 1.34), (0.5, 0.32, 0.13), MATS["engine"], parent, bevel_width=0.025)
    for i in range(5):
        cube(f"cylinder_head_horizontal_fin_{i}", (0, -0.17, 1.255 + i * 0.032), (0.58 - i * 0.024, 0.36, 0.015), MATS["engine"], parent, bevel_width=0.004)
        cube(f"cylinder_head_front_dark_gap_{i}", (0, -0.37, 1.248 + i * 0.032), (0.44 - i * 0.018, 0.012, 0.006), MATS["case_shadow"], parent, bevel_width=0.001)
    cube("rocker_cover_polished", (0, -0.15, 1.44), (0.42, 0.24, 0.09), MATS["chrome"], parent, bevel_width=0.035)
    cube("rocker_cover_black_base_gasket", (0, -0.15, 1.385), (0.46, 0.26, 0.018), MATS["engine_dark"], parent, bevel_width=0.004)
    cylinder("rocker_adjustment_cap_front", (0.16, -0.23, 1.505), 0.062, 0.016, MATS["engine_bright"], parent, vertices=56)
    cylinder("rocker_adjustment_cap_rear", (-0.16, -0.07, 1.505), 0.06, 0.016, MATS["engine_bright"], parent, vertices=56)
    curve_tube("polished_oil_feed_pipe_up_head", [(0.31, 0.08, 0.74), (0.33, -0.08, 1.12), (0.26, -0.14, 1.48)], 0.006, MATS["chrome"], parent)
    curve_tube("thin_chrome_oil_return_pipe_front", [(-0.28, -0.37, 1.38), (-0.35, -0.28, 1.1), (-0.28, -0.2, 0.78)], 0.0055, MATS["chrome"], parent)
    for side in (-1, 1):
        cube(f"rocker_cover_end_cap_{side}", (side * 0.29, -0.15, 1.44), (0.055, 0.26, 0.102), MATS["engine"], parent, bevel_width=0.025)
        cylinder(f"rocker_cover_bolt_{side}", (side * 0.22, -0.31, 1.47), 0.018, 0.01, MATS["chrome"], parent, vertices=22, rotation=(math.pi / 2, 0, 0))
        cylinder(f"rocker_cover_side_acorn_{side}", (side * 0.28, -0.02, 1.48), 0.018, 0.012, MATS["chrome"], parent, vertices=18, rotation=(0, math.pi / 2, 0))
    cube("head_black_shadow_slot", (0, -0.37, 1.33), (0.36, 0.026, 0.08), MATS["engine_dark"], parent, bevel_width=0.006)
    cube("engine_front_mount_plate", (0, -0.49, 1.0), (0.35, 0.035, 0.2), MATS["frame"], parent, bevel_width=0.012)
    cube("engine_rear_mount_black_plate", (0, 0.19, 0.9), (0.42, 0.035, 0.24), MATS["frame"], parent, bevel_width=0.012)
    capsule_between("front_pushrod_tube_polished_left", (-0.13, -0.39, 0.78), (-0.16, -0.36, 1.36), 0.014, MATS["chrome"], parent, vertices=20)
    capsule_between("front_pushrod_tube_polished_right", (0.13, -0.39, 0.78), (0.16, -0.36, 1.36), 0.014, MATS["chrome"], parent, vertices=20)
    cylinder("exhaust_port_clamp_ring", (0.23, -0.405, 1.18), 0.07, 0.028, MATS["chrome"], parent, vertices=56, rotation=(math.pi / 2, 0, 0))
    cylinder("exhaust_port_dark_hole", (0.23, -0.425, 1.18), 0.045, 0.012, MATS["case_shadow"], parent, vertices=42, rotation=(math.pi / 2, 0, 0))
    for x in (0.16, 0.31):
        cylinder("exhaust_flange_acorn_" + str(x), (x, -0.437, 1.18), 0.014, 0.012, MATS["chrome"], parent, vertices=6, rotation=(math.pi / 2, 0, 0))
    for side in (-1, 1):
        curve_tube(
            f"black_cooling_fin_cast_shadow_{side}",
            [(side * 0.29, -0.39, 0.82), (side * 0.31, -0.39, 1.1), (side * 0.25, -0.35, 1.35)],
            0.008,
            MATS["case_shadow"],
            parent,
        )
    capsule_between("spark_plug_porcelain", (0.14, -0.29, 1.34), (0.28, -0.38, 1.48), 0.015, MATS["cream"], parent, vertices=20)
    curve_tube("black_plug_wire_to_frame", [(0.28, -0.38, 1.48), (0.47, -0.2, 1.34), (0.37, 0.14, 1.12)], 0.008, MATS["frame"], parent)
    capsule_between("black_intake_boot_to_carb", (0, 0.0, 1.08), (0, 0.28, 1.08), 0.052, MATS["frame"], parent, vertices=28)
    cylinder("round_carburetor_body", (0, 0.36, 1.08), 0.108, 0.18, MATS["engine"], parent, vertices=64, rotation=(math.pi / 2, 0, 0))
    cylinder("carb_dark_throat", (0, 0.46, 1.08), 0.084, 0.05, MATS["engine_dark"], parent, vertices=48, rotation=(math.pi / 2, 0, 0))
    cylinder("carb_top_cap_polished", (0.0, 0.34, 1.205), 0.058, 0.05, MATS["chrome"], parent, vertices=42)
    flattened_sphere("carb_float_bowl", (0, 0.36, 0.94), (0.13, 0.11, 0.075), MATS["engine"], parent, segments=56, rings=24)
    cylinder("carb_float_bowl_drain_screw", (0.105, 0.32, 0.9), 0.012, 0.012, MATS["chrome"], parent, vertices=14, rotation=(0, math.pi / 2, 0))
    curve_tube("fuel_line_to_carb", [(0.12, 0.35, 1.13), (0.25, 0.2, 1.24), (0.39, -0.1, 1.31)], 0.006, MATS["rubber"], parent)
    capsule_between("black_airbox_snorkel", (0, 0.46, 1.08), (0, 0.66, 1.05), 0.07, MATS["frame"], parent, vertices=28)
    cube("small_injection_sensor_box", (0.18, 0.31, 1.18), (0.12, 0.08, 0.08), MATS["engine_dark"], parent, bevel_width=0.012)
    capsule_between("sensor_wire_to_frame", (0.22, 0.31, 1.2), (0.38, -0.1, 1.32), 0.005, MATS["frame"], parent, vertices=10)
    curve_tube("throttle_cable_arc", [(0.08, 0.36, 1.18), (0.22, 0.16, 1.42), (0.42, -0.48, 1.58)], 0.006, MATS["frame"], parent)
    curve_tube("decompression_cable_arc", [(-0.1, -0.08, 1.43), (-0.28, -0.48, 1.54), (-0.56, -0.94, 1.55)], 0.006, MATS["frame"], parent)

    for side in (-1, 1):
        for y, z in [(-0.3, 0.95), (-0.01, 1.21), (0.18, 0.75)]:
            cylinder(f"engine_case_bolt_{side}_{y}_{z}", (side * 0.47, y, z), 0.022, 0.012, MATS["chrome"], parent, vertices=24, rotation=(0, math.pi / 2, 0))
        torus(
            f"lower_case_lobe_bead_{side}",
            (side * 0.502, -0.2, 0.63),
            0.112,
            0.0045,
            MATS["engine_bright"],
            parent,
            rotation=(0, math.pi / 2, 0),
            major_segments=56,
            minor_segments=8,
        )
        curve_tube(
            f"engine_oil_line_{side}",
            [(side * 0.22, 0.13, 0.64), (side * 0.24, -0.17, 0.92), (side * 0.18, -0.28, 1.28)],
            0.007,
            MATS["frame"],
            parent,
        )
    bolt_circle("right_large_crankcase", 0.466, -0.04, 0.78, 0.235, 0.195, 10, parent, radius=0.01)
    bolt_circle("left_large_crankcase", -0.466, -0.04, 0.78, 0.22, 0.175, 8, parent, radius=0.01)
    for side in (-1, 1):
        flattened_sphere(
            f"polished_case_lower_secondary_lobe_{side}",
            (side * 0.475, 0.12, 0.64),
            (0.032, 0.11, 0.085),
            MATS["engine_bright"],
            parent,
            segments=48,
            rings=20,
        )
        torus(
            f"small_case_access_cover_bead_{side}",
            (side * 0.506, 0.12, 0.64),
            0.074,
            0.0038,
            MATS["chrome"],
            parent,
            rotation=(0, math.pi / 2, 0),
            major_segments=48,
            minor_segments=8,
        )
        cube(
            f"black_frame_shadow_behind_engine_{side}",
            (side * 0.285, -0.02, 0.86),
            (0.022, 0.58, 0.46),
            MATS["case_shadow"],
            parent,
            rotation=(0.0, 0.0, side * 0.08),
            bevel_width=0.006,
        )
        for index, y in enumerate((-0.34, -0.18, 0.0, 0.16)):
            cylinder(
                f"fin_stack_side_acorn_detail_{side}_{index}",
                (side * 0.545, y, 1.16 + index * 0.04),
                0.013,
                0.009,
                MATS["chrome"],
                parent,
                vertices=6,
                rotation=(0, math.pi / 2, 0),
            )
    curve_tube(
        "front_oil_line_black_shadow_under_tank",
        [(-0.07, -0.46, 1.38), (-0.08, -0.36, 1.03), (-0.13, -0.28, 0.72)],
        0.0045,
        MATS["case_shadow"],
        parent,
    )
    curve_tube(
        "engine_wire_harness_loop_under_tank",
        [(0.18, -0.12, 1.42), (0.33, 0.08, 1.25), (0.24, 0.33, 1.02)],
        0.006,
        MATS["frame"],
        parent,
    )

    curve_tube("chrome_exhaust_header_sweep", [(0.23, -0.39, 1.18), (0.38, -0.42, 0.86), (0.45, 0.08, 0.57)], 0.039, MATS["chrome"], parent)
    curve_tube("exhaust_header_blue_heat_tint", [(0.248, -0.385, 1.12), (0.39, -0.39, 0.91)], 0.041, MATS["mirror_glass"], parent)
    curve_tube("exhaust_lower_reflection_edge", [(0.31, -0.36, 1.02), (0.43, -0.25, 0.69), (0.52, 0.55, 0.69)], 0.009, MATS["tank_silver"], parent)
    curve_tube("chrome_exhaust_midpipe", [(0.45, 0.08, 0.57), (0.52, 0.72, 0.67), (0.55, 1.62, 0.76)], 0.055, MATS["chrome"], parent)
    capsule_between("long_tapered_muffler", (0.54, 0.7, 0.72), (0.55, 1.84, 0.78), 0.084, MATS["chrome"], parent, vertices=56)
    cylinder("dark_muffler_exit", (0.55, 1.91, 0.79), 0.094, 0.05, MATS["frame"], parent, vertices=56, rotation=(math.pi / 2, 0, 0))
    cylinder("muffler_front_band", (0.545, 0.82, 0.735), 0.092, 0.025, MATS["engine_bright"], parent, vertices=56, rotation=(math.pi / 2, 0, 0))
    cylinder("muffler_rear_band", (0.55, 1.55, 0.77), 0.091, 0.025, MATS["engine_bright"], parent, vertices=56, rotation=(math.pi / 2, 0, 0))
    for i in range(5):
        cube(
            f"muffler_heatshield_slot_{i}",
            (0.64, 0.9 + i * 0.17, 0.84),
            (0.012, 0.09, 0.018),
            MATS["engine_dark"],
            parent,
            rotation=(0.05, 0.0, 0.0),
            bevel_width=0.004,
        )
    flattened_sphere(
        "oil_drain_dark_smudge_under_case",
        (0.24, -0.22, 0.552),
        (0.07, 0.045, 0.006),
        MATS["oil_stain"],
        parent,
        segments=36,
        rings=14,
    )
    for side in (-1, 1):
        flattened_sphere(
            f"lower_crankcase_fine_road_film_{side}",
            (side * 0.51, -0.04, 0.6),
            (0.008, 0.18, 0.052),
            MATS["road_dust"],
            parent,
            segments=36,
            rings=14,
        )
        flattened_sphere(
            f"front_fin_lower_dust_patch_{side}",
            (side * 0.28, -0.43, 0.83),
            (0.045, 0.008, 0.05),
            MATS["road_dust"],
            parent,
            segments=28,
            rings=12,
        )
    flattened_sphere(
        "muffler_underside_subtle_road_film",
        (0.62, 1.26, 0.71),
        (0.009, 0.44, 0.04),
        MATS["road_dust"],
        parent,
        segments=40,
        rings=16,
        rotation=(0.08, 0.0, 0.0),
    )


def fork_gaiter(name, start, end, parent):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    for i in range(9):
        t = (i + 0.5) / 9
        center = start_v + direction * t
        rib = cylinder(f"{name}_rib_{i:02d}", center, 0.062, 0.045, MATS["rubber"], parent=None, vertices=32)
        rib.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
        set_parent(rib, parent)
    tube_between(name + "_inner_dark_boot", start, end, 0.041, MATS["rubber"], parent, vertices=28)


def fender_surface(name, center, radius, width, start_angle, end_angle, mat, parent):
    steps = 36
    verts = []
    for i in range(steps):
        t = i / (steps - 1)
        angle = start_angle + (end_angle - start_angle) * t
        y = center[1] + math.sin(angle) * radius
        z = center[2] + math.cos(angle) * radius
        verts.append((-width / 2, y, z))
        verts.append((width / 2, y, z))
    faces = []
    for i in range(steps - 1):
        faces.append((i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2))
    obj = mesh_object(name, verts, faces, mat, parent, smooth_mesh=True)
    solid = obj.modifiers.new(name + "_thin_metal", "SOLIDIFY")
    solid.thickness = 0.016
    bevel(obj, 0.008, 3)
    return obj


def create_sr_frame_details(parent):
    # Add the busy but visually important stock frame triangle, swingarm,
    # airbox, battery box, and small control rods that make a side view feel
    # like an actual SR rather than a tank placed over two wheels.
    for side in (-1, 1):
        x = side * 0.24
        capsule_between(f"side_top_frame_rail_{side}", (x, -0.58, 1.21), (x, 0.92, 1.28), 0.024, MATS["frame"], parent, vertices=22)
        capsule_between(f"side_front_down_tube_{side}", (x, -0.58, 1.2), (x, -0.18, 0.58), 0.026, MATS["frame"], parent, vertices=22)
        capsule_between(f"side_rear_down_tube_{side}", (x, 0.88, 1.24), (x, 1.14, 0.58), 0.026, MATS["frame"], parent, vertices=22)
        capsule_between(f"side_lower_cradle_{side}", (x, -0.18, 0.58), (x, 1.14, 0.58), 0.024, MATS["frame"], parent, vertices=22)
        capsule_between(f"engine_front_cradle_loop_{side}", (x, -0.52, 1.16), (x, -0.45, 0.63), 0.021, MATS["frame"], parent, vertices=20)
        capsule_between(f"engine_bottom_cradle_loop_{side}", (x, -0.45, 0.63), (x, 0.42, 0.54), 0.02, MATS["frame"], parent, vertices=20)
        capsule_between(f"side_diagonal_frame_brace_{side}", (x, -0.12, 0.61), (x, 0.64, 1.17), 0.018, MATS["frame"], parent, vertices=18)
        capsule_between(f"seat_subframe_top_rail_{side}", (side * 0.28, 0.4, 1.29), (side * 0.3, 1.55, 1.23), 0.019, MATS["frame"], parent, vertices=18)
        capsule_between(f"seat_subframe_lower_rail_{side}", (side * 0.3, 0.45, 1.05), (side * 0.32, 1.48, 0.96), 0.017, MATS["frame"], parent, vertices=16)
        capsule_between(f"rear_fender_stay_inner_{side}", (side * 0.3, 1.12, 1.0), (side * 0.22, 1.58, 0.86), 0.014, MATS["chrome"], parent, vertices=14)
        capsule_between(f"swingarm_upper_{side}", (side * 0.28, 0.17, 0.62), (side * 0.22, 1.2, 0.58), 0.026, MATS["frame"], parent, vertices=22)
        capsule_between(f"swingarm_lower_{side}", (side * 0.28, 0.17, 0.5), (side * 0.22, 1.2, 0.5), 0.02, MATS["frame"], parent, vertices=18)
        cube(f"passenger_peg_bracket_{side}", (side * 0.46, 0.82, 0.76), (0.032, 0.17, 0.12), MATS["frame"], parent, rotation=(0.0, 0.0, side * 0.2), bevel_width=0.01)
        capsule_between(f"passenger_peg_{side}", (side * 0.46, 0.86, 0.72), (side * 0.68, 0.86, 0.72), 0.018, MATS["rubber"], parent, vertices=16)
        for index, loc in enumerate(((side * 0.25, -0.28, 0.64), (side * 0.25, 0.48, 0.58), (side * 0.29, 1.16, 0.59), (side * 0.28, 0.7, 1.22))):
            cylinder(f"frame_weld_boss_{side}_{index}", loc, 0.025, 0.014, MATS["engine_dark"], parent, vertices=24, rotation=(0, math.pi / 2, 0))

    flattened_sphere("black_airbox_oval_left", (-0.36, 0.27, 1.0), (0.035, 0.26, 0.18), MATS["frame"], parent, segments=56, rings=24)
    flattened_sphere("black_airbox_oval_right", (0.36, 0.27, 1.0), (0.035, 0.26, 0.18), MATS["frame"], parent, segments=56, rings=24)
    cube("rectangular_battery_box", (0, 0.61, 1.02), (0.54, 0.28, 0.27), MATS["frame"], parent, bevel_width=0.025)
    cube("battery_box_silver_tab", (0.39, 0.61, 1.04), (0.018, 0.18, 0.06), MATS["chrome"], parent, bevel_width=0.006)
    curve_tube("rear_brake_actuator_rod", [(-0.36, 0.3, 0.58), (-0.43, 0.82, 0.55), (-0.31, 1.2, 0.58)], 0.006, MATS["chrome"], parent)
    curve_tube("shift_linkage_rod", [(-0.42, -0.11, 0.65), (-0.57, 0.08, 0.62), (-0.64, 0.27, 0.58)], 0.006, MATS["chrome"], parent)


def tire_sidewall_details(name, center, wheel):
    for side in (-1, 1):
        x = center[0] + side * 0.083
        for i in range(40):
            angle = (i / 40) * math.tau
            loc = (x, center[1] + math.sin(angle) * 0.462, center[2] + math.cos(angle) * 0.462)
            cube(
                f"{name}_sidewall_mold_dash_{side}_{i:02d}",
                loc,
                (0.007, 0.038, 0.006),
                MATS["rubber_emboss"],
                parent=wheel,
                rotation=(-angle, 0, 0),
                bevel_width=0.0012,
            )


def create_wheel(name, center, is_front, parent):
    wheel = bpy.data.objects.new(name + "_WheelSpin", None)
    wheel.empty_display_type = "ARROWS"
    wheel.empty_display_size = 0.35
    wheel.location = center
    bpy.context.collection.objects.link(wheel)
    set_parent(wheel, parent)

    torus(name + "_tire_outer", center, 0.49, 0.072, MATS["rubber"], parent=wheel)
    torus(name + "_tire_sidewall_l", (center[0] - 0.058, center[1], center[2]), 0.43, 0.011, MATS["sidewall"], parent=wheel, minor_segments=12)
    torus(name + "_tire_sidewall_r", (center[0] + 0.058, center[1], center[2]), 0.43, 0.011, MATS["sidewall"], parent=wheel, minor_segments=12)
    torus(name + "_rim", center, 0.315, 0.032, MATS["rim"], parent=wheel, major_segments=160, minor_segments=18)

    cylinder(name + "_hub", center, 0.115, 0.26, MATS["rim"], parent=wheel, vertices=72, rotation=(0, math.pi / 2, 0))
    cylinder(name + "_axle", center, 0.038, 0.52, MATS["chrome"], parent=wheel, vertices=48, rotation=(0, math.pi / 2, 0))

    if is_front:
        cylinder(name + "_disc", (center[0] - 0.09, center[1], center[2]), 0.29, 0.016, MATS["chrome"], parent=wheel, vertices=120, rotation=(0, math.pi / 2, 0))
        cube(name + "_caliper", (center[0] - 0.16, center[1] - 0.17, center[2] + 0.25), (0.08, 0.13, 0.18), MATS["tank_dark"], parent=wheel, rotation=(-0.18, 0.0, 0.2), bevel_width=0.025)
        for ring_index, ring_radius in enumerate((0.18, 0.245)):
            hole_count = 14 if ring_index == 0 else 22
            for i in range(hole_count):
                angle = (i / hole_count) * math.tau + ring_index * 0.07
                cylinder(
                    f"{name}_disc_dark_drill_{ring_index}_{i:02d}",
                    (center[0] - 0.105, center[1] + math.sin(angle) * ring_radius, center[2] + math.cos(angle) * ring_radius),
                    0.012 if ring_index == 0 else 0.009,
                    0.01,
                    MATS["frame"],
                    parent=wheel,
                    vertices=16,
                    rotation=(0, math.pi / 2, 0),
                )
    else:
        cylinder(name + "_drum_brake", center, 0.21, 0.15, MATS["chrome"], parent=wheel, vertices=80, rotation=(0, math.pi / 2, 0))

    for i in range(72):
        angle = (i / 72) * math.tau
        y = center[1] + math.sin(angle) * 0.39
        z = center[2] + math.cos(angle) * 0.39
        start_x = center[0] - 0.045 if i % 2 else center[0] + 0.045
        end_x = center[0] + 0.045 if i % 2 else center[0] - 0.045
        tube_between(
            f"{name}_spoke_{i:02d}",
            (start_x, center[1], center[2]),
            (end_x, y, z),
            0.0065,
            MATS["spoke"],
            parent=wheel,
            vertices=10,
        )

    for i in range(96):
        angle = (i / 96) * math.tau
        loc = (center[0], center[1] + math.sin(angle) * 0.525, center[2] + math.cos(angle) * 0.525)
        cube(
            f"{name}_tread_{i:02d}",
            loc,
            (0.118, 0.018, 0.006),
            MATS["sidewall"],
            parent=wheel,
            rotation=(angle, 0, 0.18 if i % 2 else -0.18),
            bevel_width=0.002,
        )

    tire_sidewall_details(name, center, wheel)

    return wheel


def create_bike(parent):
    rear = create_wheel("rear", (0, 1.2, 0.58), False, parent)
    front = create_wheel("front", (0, -1.45, 0.58), True, parent)

    fender_surface("front_chrome_fender_shell", (0, -1.45, 0.58), 0.61, 0.34, -1.2, 1.26, MATS["chrome"], parent)
    fender_surface("rear_chrome_fender_shell", (0, 1.2, 0.58), 0.62, 0.38, -1.08, 1.82, MATS["chrome"], parent)
    for side in (-0.18, 0.18):
        curve_tube("front_fender_edge_bead_" + str(side), [(side, y, z) for _, y, z in arc_points((0, -1.45, 0.58), 0.61, -1.2, 1.26)], 0.008, MATS["chrome"], parent)
        curve_tube("rear_fender_edge_bead_" + str(side), [(side, y, z) for _, y, z in arc_points((0, 1.2, 0.58), 0.62, -1.08, 1.82)], 0.008, MATS["chrome"], parent)

    frame_points = [
        ((0, 1.08, 0.82), (0, -0.48, 1.18), 0.042),
        ((0, 1.08, 0.82), (0, -0.34, 0.72), 0.038),
        ((0, -0.34, 0.72), (0, -1.13, 1.34), 0.043),
        ((0, -0.48, 1.18), (0, -1.13, 1.34), 0.037),
        ((0, -0.48, 1.18), (0, 0.86, 1.3), 0.041),
        ((0, 1.08, 0.82), (0, 0.86, 1.3), 0.037),
        ((-0.2, 1.2, 0.58), (-0.28, 0.1, 0.84), 0.03),
        ((0.2, 1.2, 0.58), (0.28, 0.1, 0.84), 0.03),
    ]
    for index, (start, end, radius) in enumerate(frame_points):
        capsule_between(f"frame_tube_{index}", start, end, radius, MATS["frame"], parent, vertices=28)
    create_sr_frame_details(parent)

    capsule_between("left_front_fork", (-0.17, -1.45, 0.58), (-0.29, -1.08, 1.43), 0.03, MATS["chrome"], parent, vertices=32)
    capsule_between("right_front_fork", (0.17, -1.45, 0.58), (0.29, -1.08, 1.43), 0.03, MATS["chrome"], parent, vertices=32)
    fork_gaiter("left_black_fork_boot", (-0.19, -1.36, 0.74), (-0.27, -1.14, 1.26), parent)
    fork_gaiter("right_black_fork_boot", (0.19, -1.36, 0.74), (0.27, -1.14, 1.26), parent)
    cube("lower_triple_clamp_polished", (0, -1.08, 1.38), (0.62, 0.075, 0.052), MATS["chrome"], parent, rotation=(0.02, 0, 0), bevel_width=0.02)
    cube("upper_triple_clamp_polished", (0, -1.02, 1.52), (0.58, 0.07, 0.045), MATS["chrome"], parent, rotation=(0.02, 0, 0), bevel_width=0.018)
    capsule_between("black_headstock_neck", (0, -0.92, 1.25), (0, -1.08, 1.52), 0.045, MATS["frame"], parent, vertices=30)
    cylinder("front_axle_nut_left", (-0.22, -1.45, 0.58), 0.055, 0.025, MATS["chrome"], parent, vertices=36, rotation=(0, math.pi / 2, 0))
    cylinder("front_axle_nut_right", (0.22, -1.45, 0.58), 0.055, 0.025, MATS["chrome"], parent, vertices=36, rotation=(0, math.pi / 2, 0))

    create_engine_unit(parent)

    # Tank, side covers, seat and badges.
    teardrop_tank(parent)
    cube("seat_base", (0, 0.68, 1.27), (0.78, 1.58, 0.065), MATS["frame"], parent, bevel_width=0.026)
    cube("ribbed_black_seat", (0, 0.68, 1.39), (0.72, 1.52, 0.135), MATS["leather"], parent, bevel_width=0.06)
    flattened_sphere("seat_rear_cushion_rounding", (0, 1.25, 1.405), (0.35, 0.24, 0.065), MATS["leather"], parent, segments=64, rings=28)
    flattened_sphere("seat_front_taper_into_tank", (0, -0.06, 1.36), (0.29, 0.19, 0.055), MATS["leather"], parent, segments=64, rings=24)
    cube("seat_front_black_gap", (0, -0.13, 1.33), (0.55, 0.06, 0.04), MATS["case_shadow"], parent, bevel_width=0.012)
    curve_tube("seat_left_lower_piping", [(-0.36, -0.06, 1.435), (-0.38, 0.54, 1.455), (-0.35, 1.33, 1.43)], 0.009, MATS["stitch"], parent)
    curve_tube("seat_right_lower_piping", [(0.36, -0.06, 1.435), (0.38, 0.54, 1.455), (0.35, 1.33, 1.43)], 0.009, MATS["stitch"], parent)
    for i in range(8):
        cube(f"seat_rib_{i}", (0, 0.02 + i * 0.17, 1.485), (0.68, 0.012, 0.008), MATS["tank_dark"], parent, bevel_width=0.003)
    for side in (-1, 1):
        curve_tube(f"seat_side_stitch_{side}", [(side * 0.37, -0.05, 1.51), (side * 0.38, 0.48, 1.515), (side * 0.36, 1.25, 1.5)], 0.006, MATS["stitch"], parent)
    side_cover(-1, parent)
    side_cover(1, parent)

    # Front cluster: light, gauges, bars, mirrors.
    cylinder("headlight_bucket", (0, -1.21, 1.39), 0.2, 0.18, MATS["chrome"], parent, vertices=96, rotation=(math.pi / 2, 0, 0))
    cylinder("headlight_lens", (0, -1.31, 1.39), 0.172, 0.032, MATS["glass"], parent, vertices=96, rotation=(math.pi / 2, 0, 0))
    torus("headlight_outer_glass_prism_ring", (0, -1.333, 1.39), 0.141, 0.0035, MATS["chrome"], parent, rotation=(math.pi / 2, 0, 0), major_segments=96, minor_segments=8)
    torus("headlight_inner_glass_prism_ring", (0, -1.335, 1.39), 0.084, 0.0028, MATS["tank_silver"], parent, rotation=(math.pi / 2, 0, 0), major_segments=84, minor_segments=8)
    cylinder("headlight_warm_bulb_core", (0, -1.343, 1.39), 0.04, 0.012, MATS["amber"], parent, vertices=40, rotation=(math.pi / 2, 0, 0))
    for i, x in enumerate((-0.105, -0.07, -0.035, 0.0, 0.035, 0.07, 0.105)):
        height = 0.18 - abs(x) * 0.62
        cube(f"headlight_vertical_lens_cut_{i}", (x, -1.349, 1.39), (0.004, 0.004, height), MATS["paint_highlight"], parent, bevel_width=0.001)
    for i, z in enumerate((1.318, 1.35, 1.43, 1.462)):
        width = 0.245 - abs(z - 1.39) * 0.92
        cube(f"headlight_horizontal_lens_cut_{i}", (0, -1.351, z), (width, 0.004, 0.0035), MATS["paint_highlight"], parent, bevel_width=0.001)
    capsule_between("headlight_left_ear_bracket", (-0.2, -1.18, 1.39), (-0.34, -1.08, 1.45), 0.012, MATS["chrome"], parent, vertices=14)
    capsule_between("headlight_right_ear_bracket", (0.2, -1.18, 1.39), (0.34, -1.08, 1.45), 0.012, MATS["chrome"], parent, vertices=14)
    capsule_between("handlebar_crossbar", (-0.62, -0.96, 1.55), (0.62, -0.96, 1.55), 0.026, MATS["chrome"], parent, vertices=24)
    capsule_between("left_grip", (-0.68, -0.96, 1.55), (-0.93, -0.9, 1.53), 0.042, MATS["rubber"], parent, vertices=24)
    capsule_between("right_grip", (0.68, -0.96, 1.55), (0.93, -0.9, 1.53), 0.042, MATS["rubber"], parent, vertices=24)
    cube("left_black_switchgear", (-0.51, -0.96, 1.57), (0.15, 0.09, 0.08), MATS["frame"], parent, rotation=(0, 0, -0.05), bevel_width=0.018)
    cube("right_black_switchgear", (0.51, -0.96, 1.57), (0.15, 0.09, 0.08), MATS["frame"], parent, rotation=(0, 0, 0.05), bevel_width=0.018)
    cube("front_brake_master_cylinder", (0.36, -0.92, 1.68), (0.18, 0.11, 0.08), MATS["frame"], parent, rotation=(0.05, 0, 0.04), bevel_width=0.018)
    cube("brake_fluid_cap_silver", (0.36, -0.945, 1.725), (0.15, 0.012, 0.045), MATS["chrome"], parent, rotation=(0.05, 0, 0.04), bevel_width=0.006)
    for x in (-0.13, 0.13):
        cylinder("gauge_cup_" + str(x), (x, -1.1, 1.58), 0.095, 0.07, MATS["chrome"], parent, vertices=64, rotation=(math.pi / 2, 0, 0))
        cylinder("gauge_face_" + str(x), (x, -1.055, 1.58), 0.082, 0.012, MATS["frame"], parent, vertices=64, rotation=(math.pi / 2, 0, 0))
        torus("gauge_bezel_inner_" + str(x), (x, -1.047, 1.58), 0.072, 0.0025, MATS["tank_silver"], parent, rotation=(math.pi / 2, 0, 0), major_segments=56, minor_segments=8)
        for i in range(9):
            angle = math.radians(225 - i * 22.5)
            tick_x = x + math.cos(angle) * 0.055
            tick_z = 1.58 + math.sin(angle) * 0.055
            cube(f"gauge_tick_{x}_{i}", (tick_x, -1.041, tick_z), (0.012, 0.003, 0.0025), MATS["cream"], parent, rotation=(0, angle, 0), bevel_width=0.0008)
        needle_end = (x + 0.035, -1.246, 1.612 if x < 0 else 1.548)
        needle_end = (needle_end[0], -1.038, needle_end[2])
        capsule_between("gauge_needle_" + str(x), (x, -1.038, 1.58), needle_end, 0.0028, MATS["red"], parent, vertices=8)
        front_text("km/h" if x < 0 else "rpm", (x, -1.036, 1.535), 0.025, MATS["cream"], parent)
    for side in (-1, 1):
        capsule_between(f"mirror_stalk_{side}", (side * 0.5, -0.98, 1.56), (side * 0.73, -1.03, 1.75), 0.012, MATS["chrome"], parent, vertices=16)
        flattened_sphere(f"mirror_back_{side}", (side * 0.78, -1.055, 1.76), (0.095, 0.026, 0.068), MATS["chrome"], parent, segments=56, rings=24, rotation=(0.0, 0.0, side * 0.08))
        flattened_sphere(f"mirror_face_{side}", (side * 0.78, -1.025, 1.76), (0.084, 0.011, 0.058), MATS["mirror_glass"], parent, segments=48, rings=18)
    curve_tube("front_brake_cable", [(0.39, -0.96, 1.52), (0.34, -1.16, 1.36), (0.22, -1.43, 0.88)], 0.006, MATS["frame"], parent)
    curve_tube("clutch_cable", [(-0.39, -0.96, 1.52), (-0.3, -1.12, 1.34), (-0.16, -0.44, 1.0)], 0.006, MATS["frame"], parent)
    for x in (-0.36, 0.36):
        sphere("front_signal_" + str(x), (x, -1.67, 1.22), (0.055, 0.055, 0.055), MATS["amber"], parent, segments=32, rings=18)

    # Rear cluster, suspension, exhaust, chain and pegs.
    cube("tail_mount", (0, 1.64, 1.18), (0.48, 0.22, 0.1), MATS["frame"], parent, bevel_width=0.035)
    cube("brake_light", (0, 1.82, 1.16), (0.3, 0.06, 0.08), MATS["red"], parent, bevel_width=0.024)
    for side in (-1, 1):
        sphere("rear_signal_" + str(side), (side * 0.32, 1.78, 1.12), (0.052, 0.052, 0.052), MATS["amber"], parent, segments=32, rings=18)
        spring(f"rear_spring_{side}", (side * 0.34, 1.08, 0.75), (side * 0.34, 0.55, 1.25), 0.08, 8, parent)
        curve_tube(f"rear_grab_rail_{side}", [(side * 0.34, 1.28, 1.46), (side * 0.42, 1.62, 1.43), (side * 0.34, 1.9, 1.28)], 0.018, MATS["chrome"], parent)
        curve_tube(f"rear_carrier_side_rail_{side}", [(side * 0.3, 1.48, 1.5), (side * 0.32, 1.86, 1.48), (side * 0.28, 2.05, 1.42)], 0.014, MATS["chrome"], parent)
    for rail_x in (-0.22, 0, 0.22):
        curve_tube(f"rear_carrier_top_slat_{rail_x}", [(rail_x, 1.5, 1.51), (rail_x, 1.83, 1.5), (rail_x, 2.02, 1.44)], 0.01, MATS["chrome"], parent)
    for y in (1.52, 1.76, 1.98):
        capsule_between(f"rear_carrier_crossbar_{y}", (-0.3, y, 1.49), (0.3, y, 1.49), 0.009, MATS["chrome"], parent, vertices=14)
    curve_tube("kickstarter_arm", [(0.36, 0.0, 0.98), (0.56, 0.15, 0.62), (0.68, 0.28, 0.54)], 0.018, MATS["chrome"], parent)
    capsule_between("kickstarter_pedal", (0.64, 0.29, 0.54), (0.82, 0.29, 0.54), 0.024, MATS["rubber"], parent, vertices=18)
    capsule_between("chain_upper", (-0.33, 1.12, 0.62), (-0.33, -0.02, 0.73), 0.016, MATS["frame"], parent, vertices=12)
    capsule_between("chain_lower", (-0.33, 1.1, 0.5), (-0.33, -0.02, 0.58), 0.014, MATS["frame"], parent, vertices=12)
    for i in range(18):
        cube(f"chain_link_{i}", (-0.335, 1.02 - i * 0.061, 0.57 + i * 0.006), (0.052, 0.022, 0.026), MATS["chrome"], parent, bevel_width=0.004)
    capsule_between("left_peg", (-0.54, 0.26, 0.76), (-0.83, 0.26, 0.76), 0.024, MATS["rubber"], parent, vertices=20)
    capsule_between("right_peg", (0.54, 0.26, 0.76), (0.83, 0.26, 0.76), 0.024, MATS["rubber"], parent, vertices=20)
    curve_tube("chrome_chain_guard_upper", [(-0.42, 0.13, 0.78), (-0.44, 0.64, 0.78), (-0.4, 1.12, 0.68)], 0.012, MATS["chrome"], parent)
    curve_tube("rear_brake_pedal_arm", [(0.48, 0.12, 0.7), (0.63, -0.02, 0.66), (0.72, -0.15, 0.62)], 0.014, MATS["chrome"], parent)
    capsule_between("rear_brake_pedal_pad", (0.7, -0.16, 0.62), (0.88, -0.16, 0.62), 0.02, MATS["rubber"], parent, vertices=18)

    return rear, front


def text(body, loc, size, mat, parent, right_side):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, math.radians(90) if right_side else math.radians(-90)))
    obj = bpy.context.object
    obj.name = "tank_badge_text_" + ("right" if right_side else "left")
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.004
    obj.data.materials.append(mat)
    set_parent(obj, parent)
    return obj


def front_text(body, loc, size, mat, parent):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, 0))
    obj = bpy.context.object
    obj.name = "front_facing_text_" + body
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.extrude = 0.002
    obj.data.materials.append(mat)
    set_parent(obj, parent)
    return obj


def spring(name, start, end, radius, turns, parent):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    length = direction.length
    points = []
    for i in range(turns * 32 + 1):
        t = i / (turns * 32)
        angle = t * turns * math.tau
        local = Vector((math.cos(angle) * radius, math.sin(angle) * radius, t * length))
        # Build in local z, then rotate to direction.
        quat = direction.to_track_quat("Z", "Y")
        points.append(start_v + quat @ local)
    curve_tube(name + "_coil", points, 0.011, MATS["spoke"], parent)
    tube_between(name + "_damper", start, end, 0.022, MATS["chrome"], parent, vertices=20)


def create_rider(parent):
    # The rider is built as a clothed mannequin: larger joint volumes and overlapping pads
    # close the artificial gaps that simple cylinders leave around the seat and controls.
    flattened_sphere("rider_seated_pelvis", (0, 0.43, 1.46), (0.34, 0.27, 0.165), MATS["denim"], parent, segments=96, rings=44)
    cube("rider_saddle_contact_shadow", (0, 0.46, 1.39), (0.58, 0.52, 0.06), MATS["denim_shadow"], parent, bevel_width=0.035)
    cube("rider_belt_and_jacket_hem", (0, 0.22, 1.63), (0.54, 0.18, 0.09), MATS["jacket_shadow"], parent, rotation=(0.08, 0, 0), bevel_width=0.04)
    flattened_sphere("rider_lower_torso", (0, 0.16, 1.81), (0.27, 0.23, 0.3), MATS["jacket"], parent, segments=96, rings=44, rotation=(0.18, 0, 0))
    flattened_sphere("rider_chest_block", (0, -0.04, 2.14), (0.34, 0.235, 0.33), MATS["jacket"], parent, segments=112, rings=48, rotation=(0.22, 0, 0))
    flattened_sphere("rider_upper_back_fill", (0, 0.16, 2.12), (0.32, 0.16, 0.38), MATS["jacket"], parent, segments=80, rings=36, rotation=(0.18, 0, 0))
    cube("rider_spine_pad", (0, 0.28, 2.06), (0.24, 0.105, 0.68), MATS["jacket_panel"], parent, rotation=(0.18, 0, 0), bevel_width=0.045)
    cube("rider_front_zipper", (0, -0.297, 2.08), (0.018, 0.012, 0.24), MATS["jacket_shadow"], parent, rotation=(0.22, 0, 0), bevel_width=0.004)
    cube("left_chest_panel", (-0.105, -0.29, 2.1), (0.16, 0.018, 0.38), MATS["jacket_panel"], parent, rotation=(0.24, 0.0, -0.08), bevel_width=0.028)
    cube("right_chest_panel", (0.105, -0.29, 2.1), (0.16, 0.018, 0.38), MATS["jacket_panel"], parent, rotation=(0.24, 0.0, 0.08), bevel_width=0.028)
    cube("rider_soft_collar", (0, -0.22, 2.37), (0.38, 0.11, 0.1), MATS["jacket_shadow"], parent, rotation=(0.12, 0, 0), bevel_width=0.04)
    if ADD_RIDER_SURFACE_SEAMS:
        for side in (-1, 1):
            curve_tube(
                f"jacket_side_body_contour_{side}",
                [(side * 0.27, -0.12, 1.72), (side * 0.32, -0.05, 2.0), (side * 0.28, 0.0, 2.28)],
                0.006,
                MATS["jacket_shadow"],
                parent,
            )
        for y, z, width in [(-0.27, 1.84, 0.42), (-0.29, 2.08, 0.5), (-0.25, 2.28, 0.44)]:
            curve_tube(f"jacket_horizontal_seam_{z}", [(-width / 2, y, z), (0, y - 0.02, z + 0.015), (width / 2, y, z)], 0.006, MATS["jacket_shadow"], parent)

    for side in (-1, 1):
        shoulder = (side * 0.34, -0.03, 2.27)
        elbow = (side * 0.49, -0.48, 1.88)
        wrist = (side * 0.68, -0.88, 1.54)
        hip = (side * 0.21, 0.43, 1.43)
        knee = (side * 0.36, -0.11, 1.0)
        ankle = (side * 0.5, 0.27, 0.68)

        flattened_sphere(f"shoulder_pad_{side}", shoulder, (0.17, 0.12, 0.1), MATS["jacket_panel"], parent, segments=56, rings=24)
        capsule_between(f"upper_arm_filled_{side}", shoulder, elbow, 0.072, MATS["jacket"], parent, vertices=40)
        flattened_sphere(f"elbow_guard_{side}", elbow, (0.088, 0.088, 0.075), MATS["jacket_panel"], parent, segments=44, rings=20)
        capsule_between(f"forearm_filled_{side}", elbow, wrist, 0.056, MATS["jacket_panel"], parent, vertices=36)
        sphere(f"glove_palm_{side}", wrist, (0.1, 0.08, 0.075), MATS["glove"], parent, segments=44, rings=22)
        cube(f"glove_cuff_{side}", (side * 0.62, -0.76, 1.62), (0.13, 0.12, 0.08), MATS["glove"], parent, rotation=(0.0, 0.0, side * 0.18), bevel_width=0.028)
        if ADD_RIDER_SURFACE_SEAMS:
            curve_tube(f"sleeve_outer_seam_{side}", [shoulder, (side * 0.52, -0.43, 1.95), wrist], 0.0045, MATS["jacket_shadow"], parent)
            for fold in range(5):
                t = fold / 4
                y = -0.18 - t * 0.48
                z = 2.13 - t * 0.48
                curve_tube(
                    f"sleeve_compression_fold_{side}_{fold}",
                    [(side * 0.38, y, z), (side * 0.46, y - 0.025, z - 0.035), (side * 0.52, y - 0.015, z - 0.01)],
                    0.0038,
                    MATS["jacket_shadow"],
                    parent,
                )
            curve_tube(
                f"forearm_highlight_crease_{side}",
                [(side * 0.5, -0.5, 1.86), (side * 0.6, -0.68, 1.69), (side * 0.67, -0.84, 1.56)],
                0.0032,
                MATS["paint_highlight"],
                parent,
            )
        for finger in range(4):
            offset = (finger - 1.5) * 0.017
            capsule_between(
                f"grip_finger_{side}_{finger}",
                (side * (0.68 + offset), -0.89, 1.53),
                (side * (0.73 + offset), -0.9, 1.51),
                0.008,
                MATS["glove"],
                parent,
                vertices=10,
            )

        capsule_between(f"upper_thigh_filled_{side}", hip, knee, 0.082, MATS["denim"], parent, vertices=44)
        flattened_sphere(f"hip_fabric_bunch_{side}", (side * 0.225, 0.28, 1.38), (0.105, 0.12, 0.065), MATS["denim_shadow"], parent, segments=44, rings=20)
        flattened_sphere(f"knee_volume_{side}", knee, (0.088, 0.09, 0.078), MATS["denim"], parent, segments=48, rings=22)
        cube(f"knee_guard_{side}", (side * 0.37, -0.15, 1.0), (0.135, 0.06, 0.105), MATS["jacket_panel"], parent, rotation=(-0.38, 0, 0), bevel_width=0.024)
        capsule_between(f"lower_leg_filled_{side}", knee, ankle, 0.061, MATS["denim"], parent, vertices=40)
        if ADD_RIDER_SURFACE_SEAMS:
            curve_tube(f"outer_pant_seam_{side}", [(side * 0.33, 0.3, 1.32), (side * 0.39, -0.07, 1.02), (side * 0.51, 0.22, 0.73)], 0.005, MATS["denim_shadow"], parent)
            for fold in range(5):
                offset = fold * 0.035
                curve_tube(
                    f"denim_knee_radial_fold_{side}_{fold}",
                    [
                        (side * (0.28 + offset), -0.18, 1.04 - fold * 0.008),
                        (side * (0.36 + offset * 0.45), -0.12, 0.99 - fold * 0.005),
                        (side * (0.43 + offset * 0.3), -0.04, 0.94),
                    ],
                    0.0038,
                    MATS["denim_highlight" if fold % 2 == 0 else "denim_shadow"],
                    parent,
                )
            curve_tube(
                f"inner_pant_seam_{side}",
                [(side * 0.18, 0.37, 1.38), (side * 0.23, 0.0, 1.08), (side * 0.38, 0.18, 0.74)],
                0.004,
                MATS["denim_shadow"],
                parent,
            )
        cube(f"boot_upper_{side}", (side * 0.5, 0.23, 0.68), (0.17, 0.2, 0.22), MATS["boot"], parent, rotation=(-0.04, 0.1 * side, 0), bevel_width=0.042)
        cube(f"boot_foot_on_peg_{side}", (side * 0.61, 0.32, 0.61), (0.2, 0.37, 0.125), MATS["boot"], parent, rotation=(-0.1, 0.18 * side, 0), bevel_width=0.04)
        cube(f"boot_sole_{side}", (side * 0.62, 0.33, 0.53), (0.21, 0.39, 0.04), MATS["rubber"], parent, rotation=(-0.1, 0.18 * side, 0), bevel_width=0.016)
        for groove in range(5):
            cube(
                f"boot_sole_tread_cut_{side}_{groove}",
                (side * 0.62, 0.17 + groove * 0.07, 0.505),
                (0.18, 0.012, 0.012),
                MATS["sidewall"],
                parent,
                rotation=(-0.1, 0.18 * side, 0),
                bevel_width=0.002,
            )
        for lace in range(4):
            cube(
                f"boot_lace_bar_{side}_{lace}",
                (side * 0.61, 0.19 + lace * 0.035, 0.72 + lace * 0.012),
                (0.008, 0.085, 0.006),
                MATS["chrome"],
                parent,
                rotation=(-0.2, 0.18 * side, side * 0.15),
                bevel_width=0.0015,
            )

    cylinder("rider_neck", (0, -0.06, 2.48), 0.13, 0.18, MATS["skin"], parent, vertices=64)
    flattened_sphere("neck_gaiter_gap_cover", (0, -0.12, 2.43), (0.23, 0.19, 0.105), MATS["jacket_shadow"], parent, segments=64, rings=24)
    helmet = bpy.data.objects.new("rider_full_face_helmet", None)
    helmet.location = (0, -0.22, 2.72)
    bpy.context.collection.objects.link(helmet)
    set_parent(helmet, parent)
    flattened_sphere("helmet_shell", (0, -0.22, 2.7), (0.315, 0.34, 0.33), MATS["helmet"], helmet, segments=128, rings=64)
    flattened_sphere("helmet_back_rounding", (0, -0.02, 2.7), (0.28, 0.14, 0.29), MATS["helmet"], helmet, segments=80, rings=36)
    cube("helmet_chin_bar", (0, -0.52, 2.54), (0.4, 0.19, 0.155), MATS["helmet"], helmet, bevel_width=0.06)
    cube("smoked_visor", (0, -0.585, 2.735), (0.41, 0.032, 0.16), MATS["visor"], helmet, bevel_width=0.03)
    cube("helmet_brow", (0, -0.56, 2.865), (0.44, 0.05, 0.045), MATS["helmet"], helmet, bevel_width=0.018)
    cube("helmet_lower_trim", (0, -0.4, 2.49), (0.42, 0.045, 0.04), MATS["helmet"], helmet, bevel_width=0.018)
    for x in (-0.24, 0.24):
        cube("helmet_vent_" + str(x), (x, -0.63, 2.69), (0.085, 0.018, 0.04), MATS["chrome"], helmet, bevel_width=0.01)
        flattened_sphere("helmet_side_pod_" + str(x), (x, -0.28, 2.72), (0.055, 0.035, 0.08), MATS["helmet"], helmet, segments=32, rings=16)


def configure_scene():
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.unit_settings.system = "METRIC"


def export_glb():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT),
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
        export_animations=False,
    )


def main():
    clear_scene()
    configure_scene()
    root = make_root()
    bike_root = make_group("classic_single_narrow_bike_root", root)
    rider_root = make_group("upright_rider_clearance_root", root)
    create_bike(bike_root)
    bike_root.scale.x = BIKE_WIDTH_SCALE
    rider_root.location = RIDER_OFFSET
    create_rider(rider_root)
    export_glb()
    print(f"Exported {OUTPUT}")


if __name__ == "__main__":
    main()

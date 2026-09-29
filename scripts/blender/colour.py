def _in_tree(tree, depth=0):
    nodes = tree.nodes
    # The atlas keeps a material's main colour in a Gamma node, or an RGB node.
    for nd in nodes:
        if nd.type == "GAMMA" and not nd.inputs["Color"].is_linked: return tuple(nd.inputs["Color"].default_value)
    for nd in nodes:
        if nd.type == "RGB": return tuple(nd.outputs[0].default_value)
    for nd in nodes:
        if nd.type == "GROUP":
            for i in nd.inputs:
                if i.name == "Color2" and not i.is_linked: return tuple(i.default_value)
    if depth < 3:
        for nd in nodes:
            if nd.type == "GROUP" and nd.node_tree:
                c = _in_tree(nd.node_tree, depth + 1)
                if c: return c
    for nd in nodes:
        if nd.type == "BSDF_PRINCIPLED" and not nd.inputs["Base Color"].is_linked: return tuple(nd.inputs["Base Color"].default_value)
    return None

def find_colour(m):
    """The colour a material shows in the atlas, wherever its node setup keeps it."""
    return _in_tree(m.node_tree) if m.use_nodes and m.node_tree else None

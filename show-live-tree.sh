pulumi stack export --stack live | python3 -c "
import json, sys
data = json.load(sys.stdin)
resources = data['deployment']['resources']
urn_to_name = {}
children = {}
roots = []
for r in resources:
    urn = r['urn']
    parent = r.get('parent', '')
    short_type = r['type'].split(':')[-1] if ':' in r['type'] else r['type']
    name = urn.split('::')[-1]
    urn_to_name[urn] = f'{short_type} ({name})'
    if parent:
        children.setdefault(parent, []).append(urn)
    else:
        roots.append(urn)
def print_tree(urn, prefix='', is_last=True):
    connector = '└── ' if is_last else '├── '
    print(f'{prefix}{connector}{urn_to_name[urn]}')
    child_prefix = prefix + ('    ' if is_last else '│   ')
    kids = children.get(urn, [])
    for i, child in enumerate(kids):
        print_tree(child, child_prefix, i == len(kids) - 1)
for root in roots:
    print(urn_to_name[root])
    kids = children.get(root, [])
    for j, child in enumerate(kids):
        print_tree(child, '', j == len(kids) - 1)
"

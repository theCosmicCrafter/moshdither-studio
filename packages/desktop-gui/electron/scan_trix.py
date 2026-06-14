import re

path = r'C:\Users\richk\Downloads\ComfyUI-TrixLoader-main\ComfyUI-TrixLoader-main\trix_loader_nodes.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

keywords = ['sam', 'SAM', 'mask', 'predict', 'grounding', 'dino', 'rmbg', 'birefnet', 'inspyrenet',
            'alpha_matting', 'post_process', 'grow', 'blur', 'flood_fill', 'segment', 'remove_background']
pattern = re.compile(r'^(\s*)(def|class)\s+([\w_]*(?:' + '|'.join(keywords) + r')[\w_]*)')

matches = []
for i, line in enumerate(lines, 1):
    m = pattern.match(line)
    if m:
        matches.append(f"Line {i}: {line.strip()}")

for m in matches[:80]:
    print(m)

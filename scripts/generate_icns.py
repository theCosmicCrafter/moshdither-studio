from PIL import Image
import struct

src = r'C:\Users\richk\CascadeProjects\moshdither-studio\docs\stitch_unzipped\screen.png'
out_path = r'C:\Users\richk\CascadeProjects\moshdither-studio\src-tauri\icons\icon.icns'

img = Image.open(src)
if img.mode != 'RGBA':
    img = img.convert('RGBA')

# PNG-based ICNS sizes for macOS 10.7+
# type: size
png_types = {
    'icp4': 16,
    'icp5': 32,
    'icp6': 64,
    'ic07': 128,
    'ic08': 256,
    'ic09': 512,
    'ic10': 1024,
    'ic11': 16,
    'ic12': 32,
    'ic13': 128,
    'ic14': 256,
}

# ICNS container: 'icns' + 4-byte total length + chunks
# Each chunk: 4-byte type + 4-byte length (includes type + length + data) + data

chunks = []
for type_code, size in png_types.items():
    resized = img.resize((size, size), Image.LANCZOS)
    # For @2x types the logical size is size/2, but the pixel data is size x size
    # The type code already encodes this for macOS
    resized.save(f'C:\\Users\\richk\\AppData\\Local\\Temp\\icns_{type_code}.png', 'PNG')
    with open(f'C:\\Users\\richk\\AppData\\Local\\Temp\\icns_{type_code}.png', 'rb') as f:
        data = f.read()
    type_bytes = type_code.encode('ascii')
    length = 8 + len(data)
    chunks.append(type_bytes + struct.pack('>I', length) + data)

body = b''.join(chunks)
header = b'icns' + struct.pack('>I', 8 + len(body))

with open(out_path, 'wb') as f:
    f.write(header + body)

print('Generated ICNS icon')

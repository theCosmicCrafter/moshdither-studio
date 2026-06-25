from PIL import Image

src = r'C:\Users\richk\CascadeProjects\moshdither-studio\docs\stitch_unzipped\screen.png'
out_dir = r'C:\Users\richk\CascadeProjects\moshdither-studio\src-tauri\icons'

img = Image.open(src)
if img.mode != 'RGBA':
    img = img.convert('RGBA')

sizes = {
    '32x32.png': (32, 32),
    '128x128.png': (128, 128),
    '128x128@2x.png': (256, 256),
}
for name, size in sizes.items():
    img.resize(size, Image.LANCZOS).save(f'{out_dir}\\{name}', 'PNG')

ico_sizes = [16, 32, 48, 64, 128, 256]
ico_imgs = [img.resize((s, s), Image.LANCZOS) for s in ico_sizes]
ico_imgs[0].save(f'{out_dir}\\icon.ico', sizes=[(s, s) for s in ico_sizes], format='ICO')

print('Generated PNG and ICO icons')

import argparse
import os
import sys
from PIL import Image, ImageChops, ImageStat
import math

def calculate_mse(img1, img2):
    """Calculate the Mean Squared Error between two images."""
    diff = ImageChops.difference(img1, img2)
    stat = ImageStat.Stat(diff)
    # Average of squared differences for each band
    mse = sum(s**2 for s in stat.mean) / len(stat.mean)
    return mse

def calculate_rmsd(img1, img2):
    """Calculate the Root Mean Square Deviation between two images."""
    return math.sqrt(calculate_mse(img1, img2))

def compare_images(webgl_path, cpu_path, threshold=2.0):
    """Compares two images and prints parity metrics."""
    if not os.path.exists(webgl_path):
        print(f"Error: WebGL output not found at {webgl_path}")
        return False
        
    if not os.path.exists(cpu_path):
        print(f"Error: CPU output not found at {cpu_path}")
        return False

    try:
        img_webgl = Image.open(webgl_path).convert('RGB')
        img_cpu = Image.open(cpu_path).convert('RGB')
    except Exception as e:
        print(f"Error loading images: {e}")
        return False

    if img_webgl.size != img_cpu.size:
        print(f"Warning: Image sizes differ! WebGL: {img_webgl.size}, CPU: {img_cpu.size}")
        img_cpu = img_cpu.resize(img_webgl.size)

    rmsd = calculate_rmsd(img_webgl, img_cpu)
    
    print("=== Render Parity Audit ===")
    print(f"WebGL Source: {webgl_path}")
    print(f"CPU Source:   {cpu_path}")
    print(f"RMSD:         {rmsd:.4f}")
    
    if rmsd <= threshold:
        print("Result:       PASS (Outputs are nearly identical)")
        return True
    else:
        print("Result:       FAIL (Significant visual discrepancy detected)")
        return False

def main():
    parser = argparse.ArgumentParser(description="Render Parity Auditor: Compares WebGL vs CPU outputs.")
    parser.add_argument('--webgl', required=True, help='Path to WebGL output image')
    parser.add_argument('--cpu', required=True, help='Path to CPU output image')
    parser.add_argument('--threshold', type=float, default=2.0, help='RMSD threshold for pass/fail')
    
    args = parser.parse_args()
    
    success = compare_images(args.webgl, args.cpu, args.threshold)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()

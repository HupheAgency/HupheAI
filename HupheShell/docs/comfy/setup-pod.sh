#!/bin/bash
# HupheAI ComfyUI Pod Setup Script
# Run this on any fresh RunPod pod with ashleykza/comfyui:latest
# Usage: bash setup-pod.sh

set -e

echo "=== HupheAI ComfyUI Setup ==="

# Activate ComfyUI venv
source /workspace/ComfyUI/venv/bin/activate
cd /workspace/ComfyUI

# 1. Install HuggingFace CLI
echo "[1/4] Installing huggingface_hub..."
pip install -q huggingface_hub

# 2. Download models
echo "[2/4] Downloading Qwen Image Edit models..."

echo "  - Diffusion model (FP8)..."
hf download Comfy-Org/Qwen-Image-Edit_ComfyUI \
  split_files/diffusion_models/qwen_image_edit_fp8_e4m3fn.safetensors \
  --local-dir /workspace/ComfyUI/models
mv /workspace/ComfyUI/models/split_files/diffusion_models/* /workspace/ComfyUI/models/diffusion_models/ 2>/dev/null || true

echo "  - CLIP text encoder..."
hf download Comfy-Org/Qwen-Image_ComfyUI \
  split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors \
  --local-dir /workspace/ComfyUI/models
mv /workspace/ComfyUI/models/split_files/text_encoders/* /workspace/ComfyUI/models/text_encoders/ 2>/dev/null || true

echo "  - VAE..."
hf download Comfy-Org/Qwen-Image_ComfyUI \
  split_files/vae/qwen_image_vae.safetensors \
  --local-dir /workspace/ComfyUI/models
mv /workspace/ComfyUI/models/split_files/vae/* /workspace/ComfyUI/models/vae/ 2>/dev/null || true

rm -rf /workspace/ComfyUI/models/split_files

# 3. Install Yedp Blockout
echo "[3/4] Installing Yedp Blockout..."
if [ ! -d "/workspace/ComfyUI/custom_nodes/ComfyUI-Yedp-Action-Director" ]; then
  cd /workspace/ComfyUI/custom_nodes
  git clone https://github.com/yedp123/ComfyUI-Yedp-Action-Director.git
else
  echo "  Already installed, skipping."
fi

# 4. Restart ComfyUI
echo "[4/4] Restarting ComfyUI..."
pkill -f "python.*main.py" 2>/dev/null || true
sleep 2
cd /workspace/ComfyUI
source /workspace/ComfyUI/venv/bin/activate
nohup python main.py --listen 0.0.0.0 --port 3001 > /dev/null 2>&1 &

echo ""
echo "=== Done! ==="
echo "ComfyUI is starting on port 3001 (nginx proxies via port 3000)."
echo "Wait ~30 seconds, then open the HTTP proxy URL in your browser."

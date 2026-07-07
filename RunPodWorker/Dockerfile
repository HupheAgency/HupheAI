# Base: PyTorch 2.1 + CUDA 11.8 dev headers (nodig voor 2DGS rasterizer compilatie)
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

# Systeem deps: OpenGL voor rasterizer, git voor submodule clone
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Clone 2DGS inclusief submodules (diff-surfel-rasterization + simple-knn)
RUN git clone --recursive https://github.com/hbb1/2d-gaussian-splatting /2d-gaussian-splatting

WORKDIR /2d-gaussian-splatting

# CUDA arch targets — nodig bij GPU-loze build (CI). Dekt A100 (8.0), A40/RTX30xx (8.6), H100 (9.0)
ENV TORCH_CUDA_ARCH_LIST="7.5;8.0;8.6;9.0+PTX"

# Python afhankelijkheden van 2DGS zelf
RUN pip install --no-cache-dir \
    plyfile \
    tqdm \
    pillow \
    imageio \
    imageio-ffmpeg \
    opencv-python-headless \
    scikit-image \
    lpips \
    matplotlib

# Compileer de CUDA differentiable rasterizer bij image build (niet bij cold start!)
# Dit is de stap die de meeste tijd kost — daarna is de container snel cold-startbaar.
RUN pip install --no-cache-dir submodules/diff-surfel-rasterization
RUN pip install --no-cache-dir submodules/simple-knn

# RunPod serverless SDK + HTTP voor dataset download
RUN pip install --no-cache-dir runpod requests

# Worker handler
COPY handler.py /handler.py

# RunPod verwacht dat de worker luistert als process
CMD ["python", "-u", "/handler.py"]

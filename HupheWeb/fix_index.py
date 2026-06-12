import re

with open('index.html', 'r') as f:
    content = f.read()

# Remove HTML element
content = content.replace('        <canvas id="title-mask-canvas" aria-hidden="true"></canvas>\n', '')

# Remove canvas vars
content = content.replace('      const titleCanvas = document.getElementById("title-mask-canvas");\n', '')
content = content.replace('      const titleCtx = titleCanvas.getContext("2d");\n', '')
content = content.replace('      const titleMask = document.createElement("canvas");\n', '')
content = content.replace('      const titleMaskCtx = titleMask.getContext("2d", { willReadFrequently: true });\n', '')

# Remove config vars
content = content.replace('        titleGridStep: 5,\n', '')
content = content.replace('        titleHoverRadius: 70,\n', '')
content = content.replace('        titlePixelSize: 4.2,\n', '')
content = content.replace('        titleFadeMs: 850,\n', '')
content = content.replace('        titleMaskPadding: 12,\n', '')

# Remove state title object
content = content.replace('''        // Inverse title pixels
        title: {
          width: 0,
          height: 0,
          points: [],
        },
''', '')

# Remove function calls
content = content.replace('        buildTitleMask();\n', '')
content = content.replace('        drawTitlePixels(0);\n', '')
content = content.replace('        drawTitlePixels(deltaMs);\n', '')
content = content.replace('        activateTitlePixels(event.clientX, event.clientY);\n', '')

# Fix hasActive in tick
content = content.replace('''          const hasActive = state.points.some(p => p.intensity > 0.002) ||
            state.title.points.some(p => p.intensity > 0.002);''', '''          const hasActive = state.points.some(p => p.intensity > 0.002);''')

# Remove function definitions using regex
content = re.sub(r'      function buildTitleMask\(\) \{.*?\n      \}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'      function drawTitlePixels\(deltaMs\) \{.*?\n      \}\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'      function activateTitlePixels\(clientX, clientY\) \{.*?\n      \}\n\n', '', content, flags=re.DOTALL)

# Remove the fonts block entirely
content = re.sub(r'      if \(document\.fonts\) \{\n        document\.fonts\.ready\.then\(\(\) => \{\n          \n          \n        \}\);\n      \}\n', '', content)

with open('index.html', 'w') as f:
    f.write(content)

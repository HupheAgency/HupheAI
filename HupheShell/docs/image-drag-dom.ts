import type React from 'react';

interface DragHandler {
    onMouseDown: (e: React.MouseEvent, blockId: string) => void;
    cleanup: () => void;
}

interface DragHandlerOptions {
    getImgElement: (blockId: string) => HTMLImageElement | null;
    getBlockGeometry: (blockId: string) => {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
        frameW: number;
        frameH: number;
    } | null;
    onDragCommit: (blockId: string, offsetX: number, offsetY: number) => void;
}

/**
 * Creates a handler for direct DOM-based image dragging to improve performance.
 * This avoids React re-renders during the drag operation.
 *
 * It works by attaching mouse listeners to the window on mouse down,
 * directly manipulating the `transform` style of the image element on mouse move,
 * and committing the final state to React only on mouse up.
 *
 * @assumption This handler assumes that the image element's `transform` property
 * is only used for `translate(x, y)`. Other transformations like `rotate` or `scale`
 * should be applied to a parent element to avoid being overwritten during the drag.
 */
export function createImageDragHandler(options: DragHandlerOptions): DragHandler {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;
    let activeBlockId: string | null = null;
    let imgElement: HTMLImageElement | null = null;

    const onMouseMove = (e: MouseEvent) => {
        if (!isDragging || !imgElement || !activeBlockId) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newOffsetX = startOffsetX + dx;
        let newOffsetY = startOffsetY + dy;

        const geometry = options.getBlockGeometry(activeBlockId);
        if (geometry) {
            newOffsetX = Math.max(geometry.minX, Math.min(newOffsetX, geometry.maxX));
            newOffsetY = Math.max(geometry.minY, Math.min(newOffsetY, geometry.maxY));
        }

        // Directly manipulate the DOM element's style.
        // This is the core of the performance optimization.
        imgElement.style.transform = `translate(${newOffsetX}px, ${newOffsetY}px)`;
    };

    const onMouseUp = () => {
        if (!isDragging || !activeBlockId) return;

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (imgElement) {
            // Read the final position from the DOM to ensure consistency.
            const transform = window.getComputedStyle(imgElement).transform;
            let finalOffsetX = 0;
            let finalOffsetY = 0;
            if (transform && transform !== 'none') {
                // Using DOMMatrix is a robust way to parse the transform matrix.
                // 'e' is tx (translateX), 'f' is ty (translateY) in the matrix(a, b, c, d, e, f).
                const matrix = new DOMMatrix(transform);
                finalOffsetX = matrix.e;
                finalOffsetY = matrix.f;
            }
            // Commit the final state once the drag is complete.
            options.onDragCommit(activeBlockId, finalOffsetX, finalOffsetY);
        }

        isDragging = false;
        activeBlockId = null;
        imgElement = null;
    };

    const onMouseDown = (e: React.MouseEvent, blockId: string) => {
        if (e.button !== 0) return; // Only main button

        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        activeBlockId = blockId;
        imgElement = options.getImgElement(blockId);

        if (!imgElement) {
            isDragging = false;
            return;
        }

        startX = e.clientX;
        startY = e.clientY;

        const transform = window.getComputedStyle(imgElement).transform;
        startOffsetX = transform && transform !== 'none' ? new DOMMatrix(transform).e : 0;
        startOffsetY = transform && transform !== 'none' ? new DOMMatrix(transform).f : 0;

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const cleanup = () => {
        // Remove listeners to prevent memory leaks if the component unmounts during a drag.
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        isDragging = false;
    };

    return { onMouseDown, cleanup };
}
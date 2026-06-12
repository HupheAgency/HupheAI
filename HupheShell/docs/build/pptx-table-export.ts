import { TableElement, TableCell } from './ir-table-types';

/**
 * Genereert geldige OpenXML voor een TableElement.
 */
export function serializeTableElement(el: TableElement): string {
    let xml = `<p:graphicFrame>
        <p:nvGraphicFramePr>
            <p:cNvPr id="${Math.floor(Math.random() * 10000)}" name="Table"/>
            <p:cNvGraphicFramePr>
                <a:graphicFrameLocks noGrp="1"/>
            </p:cNvGraphicFramePr>
            <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
            <a:off x="${el.x}" y="${el.y}"/>
            <a:ext cx="${el.width}" cy="${el.height}"/>
        </p:xfrm>
        <a:graphic>
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
                <a:tbl>`;

    // tblPr (Table Properties)
    xml += `<a:tblPr firstRow="${el.header_rows ? 1 : 0}" bandRow="1">
                <a:tableStyleId>{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}</a:tableStyleId>
            </a:tblPr>`;

    // tblGrid (Column Widths)
    xml += `<a:tblGrid>`;
    if (el.col_widths && el.col_widths.length > 0) {
        for (const width of el.col_widths) {
            xml += `<a:gridCol w="${width}"/>`;
        }
    } else if (el.rows.length > 0) {
        const cols = el.rows[0].cells.length;
        const defaultWidth = Math.floor(el.width / cols);
        for (let i=0; i<cols; i++) {
            xml += `<a:gridCol w="${defaultWidth}"/>`;
        }
    }
    xml += `</a:tblGrid>`;

    // Rows
    for (const row of el.rows) {
        xml += `<a:tr h="${row.height || 370840}">`;
        for (const cell of row.cells) {
            let spanAttrs = '';
            if (cell.col_span && cell.col_span > 1) spanAttrs += ` gridSpan="${cell.col_span}"`;
            if (cell.row_span && cell.row_span > 1) spanAttrs += ` rowSpan="${cell.row_span}"`;

            xml += `<a:tc${spanAttrs}>
                        <a:txBody>
                            <a:bodyPr/>
                            <a:lstStyle/>
                            <a:p>
                                <a:r>
                                    <a:rPr lang="en-US" dirty="0" err="1"/>
                                    <a:t>${escapeXml(cell.content)}</a:t>
                                </a:r>
                                <a:endParaRPr lang="en-US" dirty="0"/>
                            </a:p>
                        </a:txBody>
                        <a:tcPr>`;
            
            // Fill color (<a:solidFill>)
            if (cell.style?.fill_color) {
                xml += `<a:solidFill><a:srgbClr val="${cell.style.fill_color.replace('#', '')}"/></a:solidFill>`;
            }

            xml += `    </a:tcPr>
                    </a:tc>`;
        }
        xml += `</a:tr>`;
    }

    xml += `            </a:tbl>
            </a:graphicData>
        </a:graphic>
    </p:graphicFrame>`;

    return xml;
}

function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}
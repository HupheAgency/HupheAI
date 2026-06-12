import type { TableElement, TableRow, TableCell, TableCellStyle } from './ir-table-types';

/**
 * Parses an <a:tbl> XML string (or parsed object if using a parser) into a TableElement.
 * This implementation assumes the input is a string of raw OpenXML. 
 * In a real-world scenario, you would use an XML parser (like fast-xml-parser).
 */
export function parseTableElement(xmlString: string): TableElement {
    const table: TableElement = {
        id: crypto.randomUUID(), // Assuming BaseElement requires an ID
        type: 'table',
        rows: [],
        col_widths: []
    };

    // 1. Extract Column Widths (<a:tblGrid>)
    const tblGridMatch = xmlString.match(/<a:tblGrid>(.*?)<\/a:tblGrid>/s);
    if (tblGridMatch) {
        const colMatches = tblGridMatch[1].matchAll(/<a:gridCol[^>]*w="(\d+)"/g);
        for (const match of colMatches) {
            // Convert EMUs back to px or standard units
            table.col_widths!.push(Math.round(parseInt(match[1], 10) / 9525));
        }
    }

    // 2. Extract Rows (<a:tr>)
    const trMatches = xmlString.matchAll(/<a:tr[^>]*>(.*?)<\/a:tr>/gs);
    for (const trMatch of trMatches) {
        const rowXml = trMatch[1];
        
        // Extract row height if needed: trMatch[0].match(/h="(\d+)"/)

        const row: TableRow = { cells: [] };
        
        // 3. Extract Cells (<a:tc>)
        const tcMatches = rowXml.matchAll(/<a:tc([^>]*)>(.*?)<\/a:tc>/gs);
        for (const tcMatch of tcMatches) {
            const tcAttributes = tcMatch[1];
            const tcXml = tcMatch[2];
            
            const cell: TableCell = { content: '' };
            const style: TableCellStyle = {};

            // Colspan / Rowspan
            const gridSpanMatch = tcAttributes.match(/gridSpan="(\d+)"/);
            if (gridSpanMatch) cell.col_span = parseInt(gridSpanMatch[1], 10);
            
            const rowSpanMatch = tcAttributes.match(/rowSpan="(\d+)"/);
            if (rowSpanMatch) cell.row_span = parseInt(rowSpanMatch[1], 10);

            // Fill Color (<a:solidFill><a:srgbClr val="..."/></a:solidFill>)
            const tcPrMatch = tcXml.match(/<a:tcPr>(.*?)<\/a:tcPr>/s);
            if (tcPrMatch) {
                const prXml = tcPrMatch[1];
                const fillMatch = prXml.match(/<a:solidFill>\s*<a:srgbClr val="([^"]+)"/);
                if (fillMatch) {
                    style.fill_color = `#${fillMatch[1]}`;
                }
                
                // Borders could be extracted here similarly
            }

            // Text Content (<a:t>)
            const textMatches = tcXml.matchAll(/<a:t[^>]*>(.*?)<\/a:t>/g);
            const textParts: string[] = [];
            for (const tMatch of textMatches) {
                textParts.push(tMatch[1]);
            }
            cell.content = textParts.join('').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
            
            // Text styling could be extracted from <a:rPr> here

            if (Object.keys(style).length > 0) {
                cell.style = style;
            }
            
            row.cells.push(cell);
        }
        table.rows.push(row);
    }

    return table;
}

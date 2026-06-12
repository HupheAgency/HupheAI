// Types definitions for Table Element

export interface TextStyle {
    font_family?: string;
    font_size?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
}

export interface TableCellStyle {
    fill_color?: string;
    text_style?: TextStyle;
    is_header?: boolean;
    border_color?: string;
    border_width?: number;
}

export interface TableCell {
    content: string;
    col_span?: number;
    row_span?: number;
    style?: TableCellStyle;
}

export interface TableRow {
    cells: TableCell[];
    height?: number;
}

export interface BaseElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface TableElement extends BaseElement {
    type: 'table';
    rows: TableRow[];
    col_widths?: number[];
    header_rows?: number;
    header_cols?: number;
    border_color?: string;
    border_width?: number;
}
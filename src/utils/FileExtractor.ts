import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import exceljs from 'exceljs';

export class FileExtractor {
    /**
     * Extracts content from a file buffer based on mime type
     * and returns BlockNote compatible blocks.
     */
    static async extractBlocks(buffer: Buffer, mimeType: string, fileName: string): Promise<any[]> {
        let extractedBlocks: any[] = [];

        try {
            if (mimeType === 'application/pdf') {
                const data = await pdfParse(buffer);
                extractedBlocks = this.textToParagraphBlocks(data.text);
            } 
            else if (
                mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                mimeType === 'application/msword' ||
                fileName.endsWith('.docx')
            ) {
                const result = await mammoth.extractRawText({ buffer });
                extractedBlocks = this.textToParagraphBlocks(result.value);
            }
            else if (
                mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                mimeType === 'text/csv' ||
                fileName.endsWith('.xlsx') || 
                fileName.endsWith('.csv')
            ) {
                const workbook = new exceljs.Workbook();
                if (mimeType === 'text/csv' || fileName.endsWith('.csv')) {
                    const stream = require('stream');
                    const bufferStream = new stream.PassThrough();
                    bufferStream.end(buffer);
                    await workbook.csv.read(bufferStream);
                } else {
                    await workbook.xlsx.load(buffer as any);
                }

                workbook.worksheets.forEach(worksheet => {
                    const tableBlock = this.worksheetToTableBlock(worksheet);
                    if (tableBlock) {
                        extractedBlocks.push({
                            type: 'heading',
                            props: { level: 3 },
                            content: [{ type: 'text', text: worksheet.name, styles: { bold: true } }]
                        });
                        extractedBlocks.push(tableBlock);
                    }
                });
            }
            else if (mimeType.startsWith('text/') || fileName.endsWith('.txt')) {
                const text = buffer.toString('utf-8');
                extractedBlocks = this.textToParagraphBlocks(text);
            }
        } catch (error) {
            console.error(`Error extracting content from ${fileName} (${mimeType}):`, error);
            throw new Error('Failed to extract file content');
        }

        return extractedBlocks;
    }

    /**
     * Converts a raw string with newlines into BlockNote paragraph blocks
     */
    private static textToParagraphBlocks(text: string): any[] {
        if (!text) return [];
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        return lines.map(line => ({
            type: 'paragraph',
            content: [
                {
                    type: 'text',
                    text: line,
                    styles: {}
                }
            ]
        }));
    }

    /**
     * Converts an ExcelJS worksheet into a BlockNote table block
     */
    private static worksheetToTableBlock(worksheet: exceljs.Worksheet): any {
        if (worksheet.rowCount === 0) return null;

        const rows: any[] = [];
        let maxCols = 0;
        
        // Find max column count
        worksheet.eachRow((row) => {
            if (row.cellCount > maxCols) maxCols = row.cellCount;
        });

        worksheet.eachRow((row, rowNumber) => {
            const cells: any[] = [];
            
            // Loop exactly maxCols times
            for (let col = 1; col <= maxCols; col++) {
                const cell = row.getCell(col);
                const cellValue = cell.value ? cell.value.toString() : '';
                cells.push([
                    {
                        type: 'text',
                        text: cellValue,
                        styles: rowNumber === 1 ? { bold: true } : {}
                    }
                ]);
            }

            rows.push({ cells });
        });

        if (rows.length === 0) return null;

        return {
            type: 'table',
            content: {
                type: 'tableContent',
                rows: rows
            }
        };
    }
}

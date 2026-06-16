import puppeteer from 'puppeteer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../utils/r2Client';
import { generateProposalHtml } from '../templates/proposalTemplate';
import axios from 'axios';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
  HeightRule,
  PageBreak,
  ImageRun,
  TableAnchorType,
  RelativeHorizontalPosition,
  RelativeVerticalPosition
} from 'docx';
import dayjs from 'dayjs';

export class ProposalExportService {
  private static BUCKET_NAME = 'zithspace';
  private static R2_PUBLIC_URL = 'https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev';

  /**
   * Helper to fetch image buffer for docx
   */
  private static async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error fetching image for DOCX:', error);
      return null;
    }
  }

  /**
   * Generates both PDF and Word and uploads to R2
   */
  static async generateAndUpload(proposal: any) {
    const pdfUrl = await this.generatePDF(proposal);
    const docxUrl = await this.generateDocx(proposal);
    return { pdfUrl, docxUrl };
  }

  /**
   * Generate PDF using Puppeteer
   */
  static async generatePDF(proposal: any): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage();
      const html = generateProposalHtml(proposal);

      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      await new Promise(r => setTimeout(r, 2000));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCSSPageSize: true
      });

      const fileName = `${proposal.tenantId || 'global'}/proposals/${proposal.id}/proposal-${Date.now()}.pdf`;

      await s3Client.send(new PutObjectCommand({
        Bucket: this.BUCKET_NAME,
        Key: fileName,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ContentDisposition: `attachment; filename="${proposal.title || 'Proposal'}.pdf"`
      }));

      return `${this.R2_PUBLIC_URL}/${fileName}`;
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate real .docx using docx library
   */
  static async generateDocx(proposal: any): Promise<string> {
    const rawBlocks = typeof proposal.blocks_data === 'string'
      ? JSON.parse(proposal.blocks_data)
      : (proposal.blocks_data || proposal.blocks || []);

    const TYPE_ORDER: Record<string, number> = {
      'cover': 1,
      'text': 2,
      'scope': 3,
      'timeline': 4,
      'pricing': 5,
      'signature': 6,
      'section': 7
    };

    const filtered = [...rawBlocks];
    const blocks = filtered.some((b: any) => b?.type === 'component')
      ? filtered
      : filtered.sort((a: any, b: any) => (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99));

    const docSections: any[] = [];

    const getComponentLabel = (kind: string) => {
      switch (kind) {
        case 'heading': return 'Heading';
        case 'phase': return 'Phase / Milestone';
        case 'twoColumn': return 'Two Columns';
        case 'table': return 'Table';
        case 'divider': return 'Divider';
        case 'spacer': return 'Spacer';
        case 'paragraph': return 'Paragraph';
        case 'bullets': return 'Bullet List';
        case 'scope': return 'Scope of Work';
        case 'timeline': return 'Timeline & Schedule';
        case 'deliverable': return 'Deliverable';
        case 'tasklist': return 'Task List';
        case 'keyvalue': return 'Highlights';
        case 'callout': return 'Callout';
        case 'image': return 'Image';
        case 'gallery': return 'Gallery';
        case 'video': return 'Video Embed';
        case 'pricing': return 'Pricing Table';
        case 'quote': return 'Testimonial';
        case 'cta': return 'CTA Button';
        case 'signature': return 'Signature';
        default: return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Component';
      }
    };

    for (const block of blocks) {
      const data = block.data || {};
      const props = data.props || {};

      if (block.type !== 'cover' && block.type !== 'component') {
        let blockTitle = (data.title || block.type).toUpperCase();
        docSections.push(new Paragraph({
          children: [
            new TextRun({
              text: blockTitle,
              bold: true,
              color: '2563EB',
              size: 20,
              characterSpacing: 2
            })
          ],
          spacing: { before: 800, after: 400 },
          border: { bottom: { color: 'F1F5F9', size: 1, space: 1, style: BorderStyle.SINGLE } }
        }));
      }

      switch (block.type) {
        case 'cover': {
          const logoUrl = data.logoUrl || data.logo;
          if (logoUrl) {
            const logoBuffer = await this.fetchImageBuffer(logoUrl);
            if (logoBuffer) {
              docSections.push(new Paragraph({
                children: [
                  new ImageRun({
                    data: logoBuffer as any,
                    transformation: { width: 60, height: 60 },
                  } as any),
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 }
              }));
            }
          }

          docSections.push(new Paragraph({
            children: [
              new TextRun({ text: "BUSINESS PROPOSAL", bold: true, color: '2563EB', size: 18, characterSpacing: 2 })
            ],
            spacing: { before: 400, after: 100 }
          }));

          docSections.push(new Paragraph({
            children: [
              new TextRun({ text: data.title || proposal.title || "Untitled Project", bold: true, size: 64, color: '0F172A' })
            ],
            spacing: { after: 100 }
          }));

          docSections.push(new Paragraph({
            children: [
              new TextRun({ text: dayjs(data.date).format('MMMM DD, YYYY'), color: '64748B', bold: true, size: 22 })
            ],
            spacing: { after: 400 }
          }));

          if (data.projectSummary) {
            docSections.push(new Paragraph({
              children: [
                new TextRun({ text: data.projectSummary.replace(/<[^>]*>/g, ''), color: '475569', size: 24, italics: true })
              ],
              spacing: { after: 600 }
            }));
          }

          // Prepared For / By Table
          docSections.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: 'F8FAFC' },
                    margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "PREPARED FOR", bold: true, color: '2563EB', size: 16 })], spacing: { after: 100 } }),
                      new Paragraph({ children: [new TextRun({ text: data.clientName || '---', bold: true, size: 28 })] }),
                      new Paragraph({ children: [new TextRun({ text: data.clientCompany || '---', bold: true, color: '64748B' })] }),
                      new Paragraph({ children: [new TextRun({ text: data.clientAddress || '', color: '94A3B8', size: 20 })] }),
                    ]
                  }),
                  new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [] }), // spacer
                  new TableCell({
                    shading: { fill: 'F8FAFC' },
                    margins: { top: 200, bottom: 200, left: 200, right: 200 },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "PREPARED BY", bold: true, color: '2563EB', size: 16 })], spacing: { after: 100 } }),
                      new Paragraph({ children: [new TextRun({ text: data.senderName ? (data.senderPosition ? `${data.senderName} (${data.senderPosition})` : data.senderName) : '---', bold: true, size: 28 })] }),
                      new Paragraph({ children: [new TextRun({ text: data.senderCompany || '---', bold: true, color: '64748B' })] }),
                      new Paragraph({ children: [new TextRun({ text: data.senderEmail || '', color: '94A3B8', size: 20 })] }),
                      new Paragraph({ children: [new TextRun({ text: data.senderContact || '', color: '94A3B8', size: 20 })] }),
                      data.senderWebsite ? new Paragraph({ children: [new TextRun({ text: data.senderWebsite, color: '94A3B8', size: 20 })] }) : null,
                    ].filter(Boolean) as Paragraph[]
                  }),
                ]
              })
            ]
          }));

          docSections.push(new Paragraph({ spacing: { before: 400 } })); // Add a small spacer instead of a page break
          break;
        }

        case 'text':
        case 'section': {
          const content = (data.content || data.text || '').replace(/&nbsp;/g, ' ');
          // Split by typical line break tags or newlines to preserve some vertical structure
          const paragraphs = content.split(/<br\s*\/?>|\n/g);

          paragraphs.forEach((pText) => {
            const cleanText = pText.replace(/<[^>]*>/g, '').trim();
            if (cleanText) {
              docSections.push(new Paragraph({
                children: [
                  new TextRun({
                    text: cleanText,
                    size: 24,
                    color: '334155'
                  })
                ],
                spacing: { before: 120, after: 120, line: 360 }
              }));
            }
          });
          break;
        }

        case 'pricing': {
          const items = data.items || [];
          const subtotal = items.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
          const discount = data.discount || 0;
          const taxRate = data.taxRate || 0;
          const discountedSubtotal = Math.max(0, subtotal - discount);
          const taxAmount = discountedSubtotal * (taxRate / 100);
          const grandTotal = discountedSubtotal + taxAmount;
          const currency = data.currency === 'USD' ? '$' : (data.currency || '₹');

          const tableRows = [
            new TableRow({
              children: [
                new TableCell({ shading: { fill: 'F8FAFC' }, children: [new Paragraph({ children: [new TextRun({ text: "Description", bold: true, size: 18 })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
                new TableCell({ shading: { fill: 'F8FAFC' }, children: [new Paragraph({ children: [new TextRun({ text: "Qty", bold: true, size: 18 })], alignment: AlignmentType.CENTER })], width: { size: 10, type: WidthType.PERCENTAGE } }),
                new TableCell({ shading: { fill: 'F8FAFC' }, children: [new Paragraph({ children: [new TextRun({ text: "Total", bold: true, size: 18 })], alignment: AlignmentType.RIGHT })], width: { size: 30, type: WidthType.PERCENTAGE } }),
              ],
            }),
          ];

          items.forEach((item: any) => {
            tableRows.push(new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({ children: [new TextRun({ text: item.name || 'Untitled Item', bold: true, size: 22 })] }),
                    new Paragraph({ children: [new TextRun({ text: item.description || '', size: 18, color: '64748B' })] })
                  ],
                  margins: { top: 100, bottom: 100 }
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: (item.quantity || 1).toString() })], alignment: AlignmentType.CENTER })],
                  verticalAlign: VerticalAlign.CENTER
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: `${currency}${((item.price || 0) * (item.quantity || 0)).toLocaleString()}`, bold: true })], alignment: AlignmentType.RIGHT })],
                  verticalAlign: VerticalAlign.CENTER
                }),
              ],
            }));
          });

          // Summary Rows
          const addSummaryRow = (label: string, value: string, isTotal = false) => {
            tableRows.push(new TableRow({
              children: [
                new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: label, bold: isTotal, color: isTotal ? '0F172A' : '64748B' })], alignment: AlignmentType.RIGHT })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold: isTotal, size: isTotal ? 28 : 20, color: isTotal ? '2563EB' : '0F172A' })], alignment: AlignmentType.RIGHT })] }),
              ]
            }));
          };

          addSummaryRow("SUBTOTAL", `${currency}${subtotal.toLocaleString()}`);
          if (discount > 0) addSummaryRow("DISCOUNT", `-${currency}${discount.toLocaleString()}`);
          if (taxRate > 0) addSummaryRow(`TAX (${taxRate}%)`, `${currency}${taxAmount.toLocaleString()}`);
          addSummaryRow("GRAND TOTAL", `${currency}${grandTotal.toLocaleString()}`, true);

          docSections.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows
          }));
          docSections.push(new Paragraph({ spacing: { after: 800 } }));
          break;
        }

        case 'scope':
          (data.milestones || []).forEach((m: any, idx: number) => {
            docSections.push(new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      shading: { fill: 'F8FAFC' },
                      children: [
                        new Paragraph({ children: [new TextRun({ text: `PHASE ${idx + 1}: ${m.title}`, bold: true, color: '2563EB' })], spacing: { after: 100 } }),
                        new Paragraph({ children: [new TextRun({ text: "Deliverables:", bold: true, size: 18 })], spacing: { after: 50 } }),
                        ... (m.deliverables || '').split(/\n|<br\s*\/?>/g).map((line: string) => new Paragraph({ children: [new TextRun({ text: line.trim(), size: 20 })], spacing: { after: 40 } })),
                        new Paragraph({ children: [new TextRun({ text: "Tasks:", bold: true, size: 18 })], spacing: { before: 100, after: 50 } }),
                        ... (m.tasks || '').split(/\n|<br\s*\/?>/g).map((line: string) => new Paragraph({ children: [new TextRun({ text: line.trim(), size: 18, color: '475569' })], spacing: { after: 20 } })),
                      ],
                      margins: { top: 200, bottom: 200, left: 200, right: 200 }
                    })
                  ]
                })
              ]
            }));
          });
          docSections.push(new Paragraph({ spacing: { after: 400 } }));
          break;

        case 'timeline': {
          const timelineRows = (data.phases || []).map((p: any) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.title, bold: true, size: 22 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: dayjs(p.deadline).format('MMMM DD, YYYY'), bold: true, color: '2563EB' })], alignment: AlignmentType.RIGHT })] }),
              ]
            })
          );
          docSections.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: timelineRows
          }));
          docSections.push(new Paragraph({ spacing: { after: 800 } }));
          break;
        }

        case 'signature':
          if (data.ipClause || data.revisionClause || data.terminationClause || data.ndaClause) {
            docSections.push(new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      shading: { fill: 'F8FAFC' },
                      children: [
                        data.ipClause ? new Paragraph({ children: [new TextRun({ text: "INTELLECTUAL PROPERTY", bold: true, size: 16 }), new TextRun({ text: `\n${data.ipClause.replace(/<[^>]*>/g, '')}`, size: 20 })], spacing: { after: 200 } }) : null,
                        data.revisionClause ? new Paragraph({ children: [new TextRun({ text: "REVISION POLICY", bold: true, size: 16 }), new TextRun({ text: `\n${data.revisionClause.replace(/<[^>]*>/g, '')}`, size: 20 })], spacing: { after: 200 } }) : null,
                        data.terminationClause ? new Paragraph({ children: [new TextRun({ text: "TERMINATION CLAUSE", bold: true, size: 16 }), new TextRun({ text: `\n${data.terminationClause.replace(/<[^>]*>/g, '')}`, size: 20 })], spacing: { after: 200 } }) : null,
                        data.ndaClause ? new Paragraph({ children: [new TextRun({ text: "CONFIDENTIALITY / NDA", bold: true, size: 16 }), new TextRun({ text: `\n${data.ndaClause.replace(/<[^>]*>/g, '')}`, size: 20 })] }) : null,
                      ].filter(Boolean) as any,
                      margins: { top: 200, bottom: 200, left: 200, right: 200 }
                    })
                  ]
                })
              ]
            }));
            docSections.push(new Paragraph({ spacing: { after: 800 } }));
          }

          docSections.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: { top: { style: BorderStyle.DASHED, size: 1 }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "OFFICIAL SIGNATURE", bold: true, color: '94A3B8', size: 16 })], spacing: { after: 600 } }),
                      new Paragraph({ children: [new TextRun({ text: data.companySigner || 'Authorized Representative', bold: true, size: 24 })] })
                    ],
                    margins: { top: 200, bottom: 200, left: 200, right: 200 }
                  }),
                  new TableCell({ width: { size: 5, type: WidthType.PERCENTAGE }, children: [] }),
                  new TableCell({
                    borders: { top: { style: BorderStyle.DASHED, size: 1 }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: "CLIENT ACCEPTANCE", bold: true, color: '94A3B8', size: 16 })], spacing: { after: 600 } }),
                      new Paragraph({ children: [new TextRun({ text: data.clientSigner || 'Authorized Signatory', bold: true, size: 24 })] })
                    ],
                    margins: { top: 200, bottom: 200, left: 200, right: 200 }
                  }),
                ]
              })
            ]
          }));
          break;
      }
    }

    const doc = new Document({
      sections: [{
        children: docSections
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const fileName = `${proposal.tenantId || 'global'}/proposals/${proposal.id}/proposal-${Date.now()}.docx`;

    await s3Client.send(new PutObjectCommand({
      Bucket: this.BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ContentDisposition: `attachment; filename="${proposal.title || 'Proposal'}.docx"`
    }));

    return `${this.R2_PUBLIC_URL}/${fileName}`;
  }
}

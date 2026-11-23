import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Booking } from '../types/domain';

export async function generateTicketQRDataUrl(booking: Booking): Promise<string> {
  const payload = JSON.stringify({
    pnr: booking.pnr,
    route: booking.routeLabel,
    date: booking.journeyDate,
    time: booking.departureTime,
    seats: booking.seatNumbers.join(','),
    status: booking.bookingStatus,
  });
  return QRCode.toDataURL(payload, {
    width: 240,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

export async function downloadETicketPDF(booking: Booking): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const qrDataUrl = await generateTicketQRDataUrl(booking);

  // Header band
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('DESHLINE PARIBAHAN', 16, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text('Official Intercity Coach E-Ticket · Bangladesh', 16, 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(249, 115, 22);
  doc.text(`PNR: ${booking.pnr}`, 194, 18, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`Status: ${booking.bookingStatus.toUpperCase()}`, 194, 25, { align: 'right' });

  // Body container
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 44, 182, 138, 3, 3, 'S');

  // Route & Schedule
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(booking.routeLabel, 22, 57);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${booking.busName} · ${booking.busTypeName}`, 22, 64);

  // QR Code
  doc.addImage(qrDataUrl, 'PNG', 148, 50, 40, 40);
  doc.setFontSize(8);
  doc.text('Scan to verify PNR', 168, 94, { align: 'center' });

  // Details grid
  const rows: Array<[string, string]> = [
    ['Passenger Name', booking.passengerName],
    ['Phone Number', booking.passengerPhone],
    ['Journey Date', booking.journeyDate],
    ['Departure / Arrival', `${booking.departureTime} - ${booking.arrivalTime}`],
    ['Boarding Point', booking.boardingPoint],
    ['Dropping Point', booking.droppingPoint],
    ['Seat Numbers', booking.seatNumbers.join(', ')],
    ['Total Fare', `BDT ${booking.totalFare.toLocaleString('en-US')}`],
    ['Payment Status', `${booking.paymentStatus.toUpperCase()} (${booking.paymentMethod.toUpperCase()})`],
    ['Booking Channel', booking.bookingChannel.toUpperCase()],
  ];

  let y = 78;
  rows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, 22, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(String(val), 68, y);
    y += 9;
  });

  // Footer instructions
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 190, 182, 34, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Boarding & Travel Guidelines', 20, 200);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('1. Please arrive at your boarding counter at least 20 minutes prior to departure.', 20, 207);
  doc.text('2. Present this QR e-ticket along with a valid photo ID or NID if requested.', 20, 213);
  doc.text('3. Support Hotline: +880 1700-000999 · Verified Digital E-Ticket by DeshLine Paribahan.', 20, 219);

  doc.save(`DeshLine-Ticket-${booking.pnr}.pdf`);
}

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Mail, MapPin, PhoneCall, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '../../components/website/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { createSupportTicket, fetchCompanySettings, fetchCounters } from '../../services/firestoreService';
import { DEFAULT_SUPPORT_PHONE, toTelHref, toWhatsAppHref } from '../../services/voiceCallService';

export function AboutPage() {
  return (
    <PublicLayout>
      <section className="bg-[#0B1F3A] text-white py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400 mb-2">About DeshLine Paribahan</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold font-display [text-wrap:balance]">
            Modernizing intercity coach travel across Bangladesh.
          </h1>
          <p className="mt-4 text-slate-300 text-base leading-relaxed max-w-3xl">
            DeshLine Paribahan operates a unified fleet of Scania AC Business Class, Double-Deck Royal Sleepers, and Hino Express coaches across Dhaka, Chattogram, Cox&apos;s Bazar, Sylhet, Rajshahi, Khulna, Rangpur, and Barishal.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white dark:bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display">Unified Seat Inventory</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Whether booked online or at an authorized physical counter, every seat transaction runs against one real-time inventory ledger.
            </p>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display">Fleet Safety Standards</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              GPS-monitored highway coaches, dual-driver night shifts on long coastal routes, and routine pre-departure maintenance logs.
            </p>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display">Transparent Policies</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Clear fare breakdowns, verifiable QR e-tickets, and automated time-tiered cancellation refund calculations.
            </p>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

const contactSchema = z.object({
  subject: z.string().min(4, 'Subject is required'),
  message: z.string().min(10, 'Please describe your inquiry in at least 10 characters'),
});

export function ContactPage() {
  const { profile, signInWithGoogle } = useAuth();
  const { notify } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const { data: counters = [] } = useQuery({ queryKey: ['counters'], queryFn: fetchCounters });
  const { data: settings } = useQuery({ queryKey: ['company-settings'], queryFn: fetchCompanySettings, staleTime: 60_000 });
  const supportPhone = settings?.supportPhone || DEFAULT_SUPPORT_PHONE;
  const supportEmail = settings?.supportEmail || 'support@deshline.com.bd';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (values: z.infer<typeof contactSchema>) => {
    let active = profile;
    if (!active) {
      active = await signInWithGoogle();
    }
    if (!active) return;
    await createSupportTicket({
      userId: active.uid,
      userName: active.displayName,
      userEmail: active.email,
      subject: values.subject,
      message: values.message,
    });
    notify('Support ticket submitted', 'success');
    setSubmitted(true);
    reset();
  };

  return (
    <PublicLayout>
      <section className="bg-slate-50 dark:bg-slate-950 py-14 min-h-[75vh]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2">24/7 Passenger Support</p>
              <h1 className="text-3xl font-extrabold text-slate-950 dark:text-white font-display">Contact &amp; Authorized Counters</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Reach our dispatch desk or visit any authorized terminal lounge across Bangladesh.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 text-sm">
              <p className="flex items-center gap-3 text-slate-800 dark:text-slate-200">
                <PhoneCall className="w-4 h-4 text-orange-600 shrink-0" />
                <a href={toTelHref(supportPhone)} className="font-mono font-semibold hover:text-orange-600">
                  {supportPhone}
                </a>
              </p>
              <p className="flex items-center gap-3 text-slate-800 dark:text-slate-200">
                <Mail className="w-4 h-4 text-orange-600 shrink-0" />
                <a href={`mailto:${supportEmail}`} className="hover:text-orange-600">
                  {supportEmail}
                </a>
              </p>
              <p className="flex items-start gap-3 text-slate-800 dark:text-slate-200">
                <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-1" />
                <span>148 Mirpur Road, Kalyanpur Terminal, Dhaka 1207</span>
              </p>
              <div className="pt-2 flex flex-wrap gap-2.5">
                <a
                  href={toTelHref(supportPhone)}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Call Hotline Now
                </a>
                <a
                  href={toWhatsAppHref(supportPhone, 'Hello DeshLine Support')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  WhatsApp Call / Chat
                </a>
              </div>
            </div>

            {counters.length > 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-3">
                <h2 className="text-sm font-bold text-slate-950 dark:text-white">Authorized Counters</h2>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {counters.map((c) => (
                    <div key={c.id} className="py-2.5 text-xs flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white">{c.name} ({c.cityName})</p>
                        <p className="text-slate-500 dark:text-slate-400">{c.address} · {c.phone}</p>
                      </div>
                      {c.phone && (
                        <a
                          href={toTelHref(c.phone)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-semibold inline-flex items-center gap-1 shrink-0 hover:bg-emerald-100"
                        >
                          <PhoneCall className="w-3 h-3" />
                          Call
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-7">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
              <h2 className="text-xl font-bold text-slate-950 dark:text-white font-display mb-2">Send Support Request</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Tickets are logged directly into our operations queue and tracked in your Passenger Dashboard.
              </p>

              {submitted ? (
                <div className="p-5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-sm text-emerald-800 dark:text-emerald-300">
                  Your support ticket has been received. Our dispatch team will respond shortly.
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Subject</label>
                    <input
                      {...register('subject')}
                      placeholder="e.g. Boarding time inquiry for PNR..."
                      className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    />
                    {errors.subject && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.subject.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Message</label>
                    <textarea
                      {...register('message')}
                      rows={5}
                      placeholder="Provide your PNR, route, or inquiry details..."
                      className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                    />
                    {errors.message && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.message.message}</p>}
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold cursor-pointer"
                  >
                    {isSubmitting ? 'Submitting...' : profile ? 'Submit Support Ticket' : 'Sign In & Submit Ticket'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

export function FaqPage() {
  const items = [
    ['How do I download my e-ticket?', 'Visit My Bookings in the Passenger Dashboard or open /ticket/<PNR> to download a PDF or print directly.'],
    ['What happens if my payment fails mid-way?', 'Locked seats automatically release after 5 minutes if payment is not confirmed server-side.'],
    ['Can I board with just the QR code on my phone?', 'Yes, show the QR code at the boarding counter along with your booking phone number.'],
    ['How are refunds calculated?', '85% refund for cancellations 24+ hours prior, 50% between 12 and 24 hours, 0% within 12 hours of departure.'],
  ];
  return (
    <PublicLayout>
      <section className="py-14 bg-white dark:bg-slate-950 min-h-[70vh]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
          <h1 className="text-3xl font-extrabold text-slate-950 dark:text-white font-display">Frequently Asked Questions</h1>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
            {items.map(([q, a]) => (
              <div key={q} className="py-5">
                <h2 className="text-base font-bold text-slate-950 dark:text-white">{q}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

export function LegalPage({ title, kind }: { title: string; kind: 'terms' | 'privacy' | 'refund' }) {
  return (
    <PublicLayout>
      <section className="py-14 bg-white dark:bg-slate-950 min-h-[70vh]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            <ShieldCheck className="w-4 h-4" />
            DeshLine Policy Document
          </div>
          <h1 className="text-3xl font-extrabold text-slate-950 dark:text-white font-display">{title}</h1>
          {kind === 'terms' && (
            <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <p>Passengers must arrive at the selected boarding counter at least 20 minutes prior to scheduled departure. Luggage allowance is up to 20 kg per confirmed seat.</p>
              <p>Tickets are non-transferable and valid only for the coach, date, and seat numbers stated on the PNR e-ticket.</p>
            </div>
          )}
          {kind === 'privacy' && (
            <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <p>Passenger contact numbers, emails, and booking histories are strictly isolated per user account and never exposed on public ticket verification endpoints.</p>
              <p>Payment sessions are signed server-side and verified against provider webhooks without storing raw card credentials.</p>
            </div>
          )}
          {kind === 'refund' && (
            <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <p><strong>24+ Hours Before Departure:</strong> 85% of ticket fare eligible for refund.</p>
              <p><strong>12 to 24 Hours Before Departure:</strong> 50% of ticket fare eligible for refund.</p>
              <p><strong>Under 12 Hours Before Departure:</strong> Non-refundable.</p>
              <p>Approved refunds are processed to the original SSLCommerz/aamarPay method or authorized counter within 3-5 business days.</p>
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}

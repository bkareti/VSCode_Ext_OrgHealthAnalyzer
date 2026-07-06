import type { SecurityMode } from '@/store/slices/uiStore';

export const SECURITY_MODES: {
  id: SecurityMode;
  label: string;
  desc: string;
  features: string[];
}[] = [
  {
    id: 'safe',
    label: 'Safe',
    desc: 'No AI features. Local static analysis only.',
    features: ['Apex & LWC analysis', 'Data model metrics', 'Automation inventory', 'No AI calls'],
  },
  {
    id: 'standard',
    label: 'Standard',
    desc: 'AI explanations for issues. No org data sent to AI.',
    features: ['Everything in Safe', 'Issue explanations', 'Ask Architect (limited)', 'Metadata only'],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    desc: 'Full AI features including CTA architecture review.',
    features: ['Everything in Standard', 'CTA Architecture Review', 'Full Ask Architect', 'Live org queries'],
  },
];

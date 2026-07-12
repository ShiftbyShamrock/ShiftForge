'use client';

import dynamic from 'next/dynamic';

const ForgeClient = dynamic(() => import('./ForgeClient'), { ssr: false });

interface ForgeClientWrapperProps {
  styleContent: string;
  cleanBodyContent: string;
  inlineScript: string;
}

export default function ForgeClientWrapper(props: ForgeClientWrapperProps) {
  return <ForgeClient {...props} />;
}

/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  code?: string
  fullName?: string
  expiresInMinutes?: number
}

const LoginOtp = ({ code = '000000', fullName, expiresInMinutes = 10 }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Patrivers Pharmacy sign-in code: {code}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Verify it's you</Heading>
        <Text style={text}>
          {fullName ? `Hi ${fullName},` : 'Hi,'} use the code below to finish signing in to Patrivers Pharmacy.
        </Text>
        <Section style={codeBox}>
          <Text style={codeStyle}>{code}</Text>
        </Section>
        <Text style={text}>
          This code expires in {expiresInMinutes} minutes. If you didn't try to sign in, ignore this email and change your password.
        </Text>
        <Text style={footer}>Patrivers Pharmacy · Security</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LoginOtp,
  subject: 'Your Patrivers Pharmacy sign-in code',
  displayName: 'Login OTP',
  previewData: { code: '482913', fullName: 'Admin', expiresInMinutes: 10 },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}
const container = { padding: '28px 28px', maxWidth: '480px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(211, 52%, 15%)',
  margin: '0 0 18px',
}
const text = { fontSize: '14px', color: 'hsl(211, 10%, 45%)', lineHeight: '1.5', margin: '0 0 20px' }
const codeBox = {
  backgroundColor: 'hsl(210, 20%, 96%)',
  borderRadius: '6px',
  padding: '18px',
  textAlign: 'center' as const,
  margin: '0 0 20px',
}
const codeStyle = {
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  color: 'hsl(211, 52%, 25%)',
  margin: 0,
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }

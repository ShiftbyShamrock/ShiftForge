import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load and compile schema once
let validateCard: any = null;

async function getValidator() {
  if (validateCard) return validateCard;

  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');

  const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: false });
  addFormats(ajv);

  const schemaPath = join(process.cwd(), 'schema/v1/shift-card.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  validateCard = ajv.compile(schema);
  return validateCard;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validate = await getValidator();
    const valid = validate(body);

    if (valid) {
      return NextResponse.json({ valid: true });
    }

    const errors = (validate.errors || []).map((e: any) => ({
      path: e.instancePath || '/',
      message: e.message,
      params: e.params,
    }));

    return NextResponse.json({ valid: false, errors }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, error: err.message || 'Invalid JSON' },
      { status: 400 }
    );
  }
}

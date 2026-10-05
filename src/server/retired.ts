import { NextResponse } from 'next/server';

/** Old prototype endpoints. They wrote unauthenticated data and are kept only to answer clearly. */
export function retired(replacement: string) {
  const res = () =>
    NextResponse.json(
      { error: { code: 'GONE', message: `This endpoint was retired. Use ${replacement} with an operator session.` } },
      { status: 410 },
    );
  return { GET: res, POST: res, PUT: res, DELETE: res };
}

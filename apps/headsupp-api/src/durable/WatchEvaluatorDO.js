import { evaluateWatchRequest } from '../services/watches/watch-evaluator.js';

export class WatchEvaluatorDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'POST') {
      const input = await request.json();
      if (this.env.DB) {
        const result = await evaluateWatchRequest({
          db: this.env.DB,
          env: this.env,
          input,
        });
        return new Response(JSON.stringify(result), {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      return new Response(
        JSON.stringify({
          status: 'accepted',
          input,
        }),
        {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        status: 'not_implemented',
        message: 'WatchEvaluatorDO is reserved for serialized watch evaluation.',
      }),
      {
        status: 501,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}

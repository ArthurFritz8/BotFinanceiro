// ADR-118 — Helper de coalescing de promessas in-flight.
//
// Objetivo: evitar disparar a mesma chamada N vezes em paralelo quando o
// usuario clica rapido em "Atualizar" ou troca ativo enquanto outra chamada
// ainda nao retornou. A primeira chamada com chave X registra a promise; as
// chamadas subsequentes com a mesma chave reutilizam a promise existente ate
// ela settlar (resolver ou rejeitar).
//
// Uso:
//   const coalescer = createCoalescer();
//   const data = await coalescer.run("chart:bitcoin:1h", () => fetchChart(...));
//
// Comportamento:
//   - run(key, fn): se ja existe promise pendente com chave, retorna a mesma
//     instancia. Caso contrario, chama fn() e armazena o resultado ate settlar.
//   - clear(key?): remove uma chave especifica ou todas (sem cancelar a fetch).
//   - inFlight(key): retorna boolean.
//   - size(): quantas promises pendentes existem.
//
// Observacao: este helper NAO cancela requests (AbortController fica a cargo
// de quem chama). So evita duplicacao redundante.

export function createCoalescer() {
  const inFlightMap = new Map();

  return {
    run(key, fn) {
      if (typeof key !== "string" || key.length === 0) {
        throw new TypeError("[coalescer] key precisa ser string nao vazia");
      }
      if (typeof fn !== "function") {
        throw new TypeError("[coalescer] fn precisa ser function");
      }

      const existing = inFlightMap.get(key);
      if (existing) {
        return existing;
      }

      // Chama fn() sincronicamente para que o caller possa observar side-effects
      // imediatamente (importante para testes e tracking de chamadas).
      let raw;
      try {
        raw = fn();
      } catch (error) {
        return Promise.reject(error);
      }
      const promise = Promise.resolve(raw);

      const tracked = promise.finally(() => {
        // Remove apenas se ainda for a mesma promise (paranoia contra clear()).
        if (inFlightMap.get(key) === tracked) {
          inFlightMap.delete(key);
        }
      });

      inFlightMap.set(key, tracked);
      return tracked;
    },

    inFlight(key) {
      return inFlightMap.has(key);
    },

    clear(key) {
      if (typeof key === "string") {
        inFlightMap.delete(key);
      } else {
        inFlightMap.clear();
      }
    },

    size() {
      return inFlightMap.size;
    },
  };
}

// Coalescer global de conveniencia para callers que nao querem injecao de
// dependencia. Em testes prefira createCoalescer() para isolamento.
export const sharedCoalescer = createCoalescer();

# Registo O.C.S.P. #001 - Arquitetura IA Copiloto

## Objetivo

Implementar um "Copiloto Financeiro" inteligente e unificado, mantendo o consumo de API no minimo (Custo Zero) e garantindo respostas precisas.

## Contexto

O utilizador interagira atraves de uma interface de chat unica. A IA precisara de aceder a dados pessoais (saldos, carteiras) e dados de mercado em tempo real. Injetar todos estes dados no prompt a cada mensagem excederia os limites gratuitos do OpenRouter e tornaria o sistema lento.

## Solucao

Adocao de Function Calling / Tool Calling. O backend em Node.js expora funcoes especificas (ex: `obterSaldoCripto()`, `resumirAirdrop()`) para a IA. A IA analisara a intencao do utilizador e, de forma autonoma, solicitara ao servidor a execucao destas ferramentas apenas quando estritamente necessario para formular a resposta.

## Prevencao

As funcoes fornecidas a IA atuarao estritamente com permissoes de Apenas Leitura (Read-Only). Sera implementada uma validacao de esquema (Zod) nos parametros enviados pela IA para evitar injecoes ou falhas na conversao de tipos antes de consultar a base de dados.
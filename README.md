# Web Riddle JS

## Resumo

Trilha de enigmas em JavaScript para resolver em dupla: oito fechaduras encadeadas, em que a pista de cada uma abre a próxima. Atividade da UC 13 (Desenvolvimento Web) do Senac.

Acesse: https://profmv.github.io/web-riddle-js/

## Como funciona

- Informe um apelido para a dupla e comece pela fechadura 0.
- Resolva cada enigma na bancada da página, no console do navegador (F12) ou no VS Code, quando o enunciado pedir.
- O progresso fica salvo no navegador. O código de progresso permite continuar em outro computador e é o que a dupla entrega ao professor.
- Cada fechadura está cifrada com a resposta da anterior, por isso este repositório não mostra as fechaduras seguintes nem as respostas.

## Executar localmente

A página carrega `etapas.json` com `fetch`, que não funciona abrindo o arquivo direto (`file://`). Use qualquer servidor HTTP estático na pasta, por exemplo a extensão Live Server do VS Code.

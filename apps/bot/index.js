require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const db = require('./firebase');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

client.once('ready', () => {
    console.log(`🤖 Bot conectado como ${client.user.tag}`);
});

const perguntas = [
    { texto: "💼 Qual é seu Nick?", validar: null },
    {
        texto: "⚔️ Qual sua classe principal?\n1 - Kina\n2 - Magic\n3 - Pala\n4 - Upo todas por igual",
        validar: /^[1-4]$/
    },
    { texto: "🪓 Qual seu nível de melee?", validar: /^\d+$/ },
    { texto: "🌹 Qual seu nível de ataque à distância?", validar: /^\d+$/ },
    { texto: "✨ Qual seu nível de magia?", validar: /^\d+$/ },
    { texto: "🛡️ Qual seu nível de defesa?", validar: /^\d+$/ },
    { texto: "🔢 Qual seu level total?", validar: /^\d+$/ }
];

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const user = interaction.user;
    const dm = await user.createDM();
    const filter = m => m.author.id === user.id;

    if (interaction.commandName === 'recrutar') {
        await interaction.deferReply({ ephemeral: true });

        try {
            await dm.send("👋 Olá! Vamos preencher seu formulário de entrada:");
            const respostas = {};

            for (let i = 0; i < perguntas.length; i++) {
                let respostaValida = false;

                while (!respostaValida) {
                    await dm.send(perguntas[i].texto);
                    const coletada = await dm.awaitMessages({ filter, max: 1, time: 60000 });

                    if (!coletada.size) {
                        await dm.send("⏰ Tempo esgotado. Tente novamente mais tarde.");
                        await interaction.editReply({ content: '❌ Formulário cancelado por inatividade.' });
                        return;
                    }

                    const resposta = coletada.first().content.trim();
                    if (perguntas[i].validar && !perguntas[i].validar.test(resposta)) {
                        await dm.send(i === 1 ? "❗ Opção errada, tente novamente. Digite um número de 1 a 4." : "❗ Esse campo só aceita números, favor digitar novamente.");
                    } else {
                        respostas[i] = resposta;
                        respostaValida = true;
                    }
                }
            }

            await salvarNoFirebase(user.id, respostas);
            await dm.send("✅ Formulário recebido com sucesso! Bem-vindo à guilda.");
            await interaction.editReply({ content: '📩 Formulário preenchido com sucesso via DM!' });
        } catch (err) {
            console.error("❌ Erro ao iniciar formulário:", err);
            await interaction.editReply({ content: '❌ Não consegui enviar sua DM. Verifique se você está com DMs abertas.' });
        }
    }

    if (interaction.commandName === 'evento') {
        await interaction.deferReply({ ephemeral: true });

        try {
            let continuar = true;

            while (continuar) {
                let escolha;
                do {
                    await dm.send("📋 O que deseja fazer?\n1 - Adicionar/Excluir evento\n2 - Iniciar evento\n3 - Participar do evento\n4 - Listar eventos");
                    const res = await dm.awaitMessages({ filter, max: 1, time: 60000 });
                    if (!res.size) return dm.send("⏰ Tempo esgotado.");
                    escolha = res.first().content.trim();
                    if (!['1', '2', '3', '4'].includes(escolha)) await dm.send("❗ Opção inválida, digite 1, 2, 3 ou 4.");
                } while (!['1', '2', '3', '4'].includes(escolha));

                if (escolha === "1") {
                    let subopcao;
                    do {
                        await dm.send("📋 O que deseja fazer?\n1 - Adicionar evento\n2 - Excluir evento");
                        const res = await dm.awaitMessages({ filter, max: 1, time: 60000 });
                        if (!res.size) return dm.send("⏰ Tempo esgotado.");
                        subopcao = res.first().content.trim();
                        if (!['1', '2'].includes(subopcao)) await dm.send("❗ Opção inválida, digite 1 ou 2.");
                    } while (!['1', '2'].includes(subopcao));

                    if (subopcao === "1") {
                        await dm.send("📝 Digite o nome do evento:");
                        const nome = await coletarResposta(dm, filter);

                        await dm.send("💯 Digite os pontos do evento:");
                        const pontos = await coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");

                        await dm.send(
                            "❓ Qual tipo de evento é?\n" +
                            "1 - Quiz\n" +
                            "2 - Rolagem de dados\n" +
                            "3 - Portas\n" +
                            "4 - Customizado (Ainda em desenvolvimento)"
                        );
                        const tipoEvento = await coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");

                        await dm.send("💯 Digite o numero de rodadas:");
                        const numeroRodadas = await coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");

                        await db.collection('eventos').add({ nome, pontos: parseInt(pontos), tipo: parseInt(tipoEvento), emExecucao: false, jogadores: [], numeroRodadas: numeroRodadas, criadoEm: new Date().toISOString() });
                        await dm.send(`✅ Evento "${nome}" adicionado com ${pontos} pontos.`);
                    }

                    if (subopcao === "2") {
                        const eventosSnap = await db.collection('eventos').get();
                        if (eventosSnap.empty) {
                            await dm.send("⚠️ Nenhum evento cadastrado.");
                        } else {
                            const eventos = [];
                            let msg = "";
                            let index = 1;

                            eventosSnap.forEach(doc => {
                                const data = doc.data();
                                eventos.push({ id: doc.id, nome: data.nome });
                                msg += `${index} - ${data.nome}\n`;
                                index++;
                            });

                            let valido = false;
                            while (!valido) {
                                await dm.send("📜 Lista de eventos:\n" + msg + "\nDigite o número para excluir:");
                                const res = await dm.awaitMessages({ filter, max: 1, time: 60000 });
                                if (!res.size) return dm.send("⏰ Tempo esgotado.");
                                const num = parseInt(res.first().content.trim());
                                if (isNaN(num) || num < 1 || num > eventos.length) {
                                    await dm.send("❗ Número inválido. Tente novamente.");
                                } else {
                                    await db.collection('eventos').doc(eventos[num - 1].id).delete();
                                    await dm.send(`🗑️ Evento "${eventos[num - 1].nome}" excluído com sucesso.`);
                                    valido = true;
                                }
                            }
                        }
                    }
                } else if (escolha === "3") {
                    try {
                        const userDoc = await db.collection('usuarios').doc(user.id).get();

                        if (!userDoc.exists) {
                            await dm.send("⚠️ Você ainda não preencheu o formulário de entrada.");
                            return;
                        }

                        const dados = userDoc.data();
                        await dm.send(`🧾 Seus dados de participante:\n🆔 ID: ${user.id}\n📛 Nick: ${dados.nick}`);

                        // Aguarda até encontrar um evento com emExecucao = true
                        let querySnapshot;
                        let tentativas = 0;
                        const maxTentativas = 30;

                        do {
                            querySnapshot = await db.collection('eventos')
                                .where('emExecucao', '==', true)
                                .limit(1)
                                .get();

                            if (querySnapshot.empty) {
                                tentativas++;
                                if (tentativas >= maxTentativas) {
                                    await dm.send("⚠️ Nenhum evento em execução foi encontrado após várias tentativas.");
                                    return;
                                }
                                await new Promise(resolve => setTimeout(resolve, 1000)); // espera 1 segundo
                            }
                        } while (querySnapshot.empty);

                        const eventoDoc = querySnapshot.docs[0];
                        const evento = eventoDoc.data();
                        evento.jogadores.push(dados);
                        await dm.send(`▶️ Evento em execução: ${evento.nome}\n💯 Pontos: ${evento.pontos}`);
                        let dadoRolado = false;
                        let primeiraIteração = true;
                        setTimeout(async () => {
                            if (primeiraIteração == false && dadoRolado == false) {
                                console.error("❌ Erro ao buscar dados do usuário:");
                            }
                        }, 1000);
                        await dm.send(
                            "❓ Escolha uma opção?\n" +
                            "1 - Rolar dado"
                        );
                        const rolarDado = await coletarResposta(dm, filter, /^1$/, "❗ Digite apenas o número 1.");
                        const resultado = Math.floor(Math.random() * 20) + 1;
                        await dm.send(`🎲 Você rolou o dado... Resultado: **${resultado}**!`);
                        const jogada = {
                            jogador: dados,
                            resultado: resultado
                        }
                        // evento.jogadas.push(jogada);
                        dadoRolado = true;

                    } catch (error) {
                        console.error("❌ Erro ao buscar dados do usuário:", error);
                        await dm.send("❌ Erro ao buscar seus dados. Tente novamente mais tarde.");
                    }

                } else if (escolha === "4") {
                    const eventosSnap = await db.collection('eventos').get();
                    if (eventosSnap.empty) {
                        await dm.send("⚠️ Nenhum evento cadastrado.");
                    } else {
                        let lista = "";
                        let index = 1;
                        eventosSnap.forEach(doc => {
                            const data = doc.data();
                            lista += `${index++} - ${data.nome} (${data.pontos} pts)\n`;
                        });
                        await dm.send("📋 Eventos cadastrados:\n" + lista);
                    }
                } else if (escolha === "2") {
                    const eventosSnap = await db.collection('eventos').get();
                    if (eventosSnap.empty) {
                        await dm.send("⚠️ Nenhum evento cadastrado.");
                    } else {
                        const eventos = [];
                        let lista = "";
                        let index = 1;

                        eventosSnap.forEach(doc => {
                            const data = doc.data();
                            eventos.push({ id: doc.id, nome: data.nome, pontos: data.pontos });
                            lista += `${index} - ${data.nome}\n`;
                            index++;
                        });

                        await dm.send("📋 Qual evento deseja iniciar?\n" + lista);

                        let eventoEscolhido = null;
                        while (!eventoEscolhido) {
                            const res = await dm.awaitMessages({ filter, max: 1, time: 60000 });
                            if (!res.size) return dm.send("⏰ Tempo esgotado.");

                            const num = parseInt(res.first().content.trim());
                            if (isNaN(num) || num < 1 || num > eventos.length) {
                                await dm.send("❗ Número inválido. Tente novamente.");
                            } else {
                                const evento = eventos[num - 1];
                                await dm.send(`✅ Evento iniciado:\n**Nome:** ${evento.nome}\n**Pontos:** ${evento.pontos} pts`);
                                if (evento.tipo == 2) {
                                    await dm.send("💯 1 - Iniciar evento\n2 - Cancelar");
                                    const respostaEvento = await coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");
                                    if (respostaEvento == 1) {
                                        for (let index = 0; index < evento.numeroRodadas; index++) {
                                            setTimeout(() => {
                                                console.log("⏰ Passaram-se 10 segundos!");
                                            }, 10000);
                                            //evento em andamento   
                                        }
                                    }
                                }
                                eventoEscolhido = true;
                            }
                        }
                    }
                }

                if (["1", "2", "3", "4"].includes(escolha)) {
                    let repetir;
                    do {
                        await dm.send("❓ Deseja fazer mais alguma coisa?\n1 - Sim\n2 - Encerrar");
                        const res = await dm.awaitMessages({ filter, max: 1, time: 60000 });
                        if (!res.size) return dm.send("⏰ Tempo esgotado.");
                        repetir = res.first().content.trim();
                        if (repetir === "1") continuar = true;
                        else if (repetir === "2") {
                            continuar = false;
                            await dm.send("👋 Encerrando a interação. Até mais!");
                        }
                        else await dm.send("❗ Digite 1 para continuar ou 2 para encerrar.");
                    } while (!["1", "2"].includes(repetir));
                }
            }

            await interaction.editReply({ content: '✅ Comando /evento finalizado via DM.' });
        } catch (err) {
            console.error("❌ Erro no comando /evento:", err);
            await interaction.editReply({ content: '❌ Erro ao executar o comando. Verifique se você está com DMs abertas.' });
        }

    }
});

async function coletarResposta(dmChannel, filter, regex = null, mensagemErro = null) {
    while (true) {
        const coletada = await dmChannel.awaitMessages({ filter, max: 1, time: 60000 });
        if (!coletada.size) throw new Error("Tempo esgotado");
        const resposta = coletada.first().content.trim();
        if (regex && !regex.test(resposta)) {
            await dmChannel.send(mensagemErro || "❗ Entrada inválida. Tente novamente.");
        } else {
            return resposta;
        }
    }
}

async function salvarNoFirebase(userId, respostas) {
    try {
        await db.collection('usuarios').doc(userId).set({
            nick: respostas[0], classe: respostas[1], melee: respostas[2], distancia: respostas[3],
            magia: respostas[4], defesa: respostas[5], level: respostas[6], data: new Date().toISOString()
        });
        console.log(`📥 Dados salvos no Firebase para o usuário ${userId}`);
    } catch (err) {
        console.error("🔥 Erro ao salvar no Firebase:", err);
    }
}

client.login(process.env.TOKEN);

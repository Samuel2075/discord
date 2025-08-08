let self = {};

self.LoadReferences = () => {
    require('dotenv').config();
    const { Client, GatewayIntentBits, Partials } = require('discord.js');
    self.db = require('./firebase');
    self.fs = require('fs');
    self.client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ],
        partials: [Partials.Channel]
    });

    self.opcoesMenus = {
        evento: {
            ADICIONAR_EXCLUIR_EVENTO: '1',
            INICIAR_EVENTO: '2',
            PARTICIPAR_EVENTO: '3',
            LISTAR_EVENTOS: '4'
        }
    };

    self.perguntas = [
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
};

self.coletarResposta = async (dmChannel, filter, regex = null, mensagemErro = null) => {
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
};

self.SalvarNoFirebase = async (userId, respostas) => {
    try {
        await self.db.collection('usuarios').doc(userId).set({
            nick: respostas[0], classe: respostas[1], melee: respostas[2], distancia: respostas[3],
            magia: respostas[4], defesa: respostas[5], level: respostas[6], pontos: 0, data: new Date().toISOString()
        });
        console.log(`📥 Dados salvos no Firebase para o usuário ${userId}`);
    } catch (err) {
        console.error("🔥 Erro ao salvar no Firebase:", err);
    }
};

self.LoadEvents = () => {
    self.client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;
        self.user = interaction.user;
        self.dm = await self.user.createDM();
        const filter = m => m.author.id === self.user.id;

        if (interaction.commandName === 'recrutar') {
            await self.Recrutar(interaction, filter);
        }
        if (interaction.commandName === 'evento') {
            await self.Evento(interaction, self.dm, filter);
        }
        if (interaction.commandName === 'loja') {
            const userDoc = await self.db.collection('usuarios').doc(self.user.id).get();
            if (!userDoc.exists) {
                await self.dm.send("⚠️ Você precisa preencher o formulário de entrada primeiro usando /recrutar.");
                await interaction.reply({ content: "Preencha o formulário de entrada usando /recrutar primeiro!", ephemeral: true });
                return;
            }
            const userData = userDoc.data();
            await self.Loja(interaction, self.dm, filter, userData);
        }
    });

    self.client.once('ready', () => {
        console.log(`🤖 Bot conectado como ${self.client.user.tag}`);
    });
};

self.AdicionarExcluirEventos = async (dm, filter) => {
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
        const nome = await self.coletarResposta(dm, filter);

        await dm.send("💯 Digite os pontos do evento:");
        const pontos = await self.coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");

        await dm.send(
            "❓ Qual tipo de evento é?\n" +
            "1 - Quiz\n" +
            "2 - Rolagem de dados\n" +
            "3 - Portas\n" +
            "4 - Customizado (Ainda em desenvolvimento)"
        );
        const tipoEvento = await self.coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");

        await dm.send("💯 Digite o número de rodadas:");
        const numeroRodadas = await self.coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");

        await self.db.collection('eventos').add({ nome, pontos: parseInt(pontos), tipo: parseInt(tipoEvento), emExecucao: false, jogadores: [], numeroRodadas: parseInt(numeroRodadas), criadoEm: new Date().toISOString() });
        await dm.send(`✅ Evento "${nome}" adicionado com ${pontos} pontos.`);
    }

    if (subopcao === "2") {
        const eventosSnap = await self.db.collection('eventos').get();
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
                    await self.db.collection('eventos').doc(eventos[num - 1].id).delete();
                    await dm.send(`🗑️ Evento "${eventos[num - 1].nome}" excluído com sucesso.`);
                    valido = true;
                }
            }
        }
    }
};

self.IniciarEvento = async (dm, filter) => {
    const eventosSnap = await self.db.collection('eventos').get();
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

        let eventoEscolhido = false;
        while (!eventoEscolhido) {
            const res = await dm.awaitMessages({ filter, max: 1, time: 60000 });
            if (!res.size) return dm.send("⏰ Tempo esgotado.");

            const num = parseInt(res.first().content.trim());
            if (isNaN(num) || num < 1 || num > eventos.length) {
                await dm.send("❗ Número inválido. Tente novamente.");
            } else {
                const evento = eventos[num - 1];
                await self.db.collection('eventos').doc(evento.id).update({ emExecucao: true });
                await dm.send(`✅ Evento iniciado:\n**Nome:** ${evento.nome}\n**Pontos:** ${evento.pontos} pts`);
                eventoEscolhido = true;
            }
        }
    }
};

self.ParticiparEvento = async (dm, filter) => {
    try {
        const userDoc = await self.db.collection('usuarios').doc(self.user.id).get();

        if (!userDoc.exists) {
            await dm.send("⚠️ Você ainda não preencheu o formulário de entrada.");
            return;
        }

        const dados = userDoc.data();
        await dm.send(`🧾 Seus dados de participante:\n🆔 ID: ${self.user.id}\n📛 Nick: ${dados.nick}`);

        let tentativas = 0;
        const maxTentativas = 30;
        let eventosExecucao = [];

        do {
            const querySnapshot = await self.db.collection('eventos')
                .where('emExecucao', '==', true)
                .get();

            eventosExecucao = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                eventosExecucao.push({ id: doc.id, nome: data.nome, pontos: data.pontos, jogadores: data.jogadores || [] });
            });

            if (eventosExecucao.length === 0) {
                tentativas++;
                if (tentativas >= maxTentativas) {
                    await dm.send("⚠️ Nenhum evento em execução foi encontrado após várias tentativas.");
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // espera 1 segundo
            }
        } while (eventosExecucao.length === 0);

        // Mostra lista para escolha
        let lista = "";
        for (let i = 0; i < eventosExecucao.length; i++) {
            lista += `${i + 1} - ${eventosExecucao[i].nome} (${eventosExecucao[i].pontos} pts)\n`;
        }
        await dm.send("📋 Eventos em execução:\n" + lista);

        // Usuário escolhe o evento
        let eventoEscolhido = null;
        while (!eventoEscolhido) {
            await dm.send("Digite o número do evento em que deseja participar:");
            const res = await dm.awaitMessages({ filter, max: 1, time: 60000 });
            if (!res.size) return dm.send("⏰ Tempo esgotado.");

            const num = parseInt(res.first().content.trim());
            if (isNaN(num) || num < 1 || num > eventosExecucao.length) {
                await dm.send("❗ Número inválido. Tente novamente.");
            } else {
                eventoEscolhido = eventosExecucao[num - 1];
            }
        }

        // Registrar o jogador nesse evento (adiciona aos jogadores)
       const refEvento = self.db.collection('eventos').doc(eventoEscolhido.id);

        // Verifica se já está no evento pelo ID do usuário
        const jaParticipa = (eventoEscolhido.jogadores || []).some(j => j && j.nick === dados.nick && j.level === dados.level && j.classe === dados.classe && j.melee === dados.melee); // pode ajustar os campos se quiser só por id

        if (jaParticipa) {
            await dm.send("⚠️ Você já está participando deste evento!");
            return;
        }

        // Adiciona o usuário
        await refEvento.update({
            jogadores: [...(eventoEscolhido.jogadores || []), dados]
        });

        await dm.send(`▶️ Evento em execução: ${eventoEscolhido.nome}\n💯 Pontos: ${eventoEscolhido.pontos}`);
        await dm.send("❓ Escolha uma opção?\n1 - Rolar dado");
        await self.coletarResposta(dm, filter, /^1$/, "❗ Digite apenas o número 1.");
        const resultado = Math.floor(Math.random() * 20) + 1;
        await dm.send(`🎲 Você rolou o dado... Resultado: **${resultado}**!`);

    } catch (error) {
        console.error("❌ Erro ao buscar dados do usuário:", error);
        await dm.send("❌ Erro ao buscar seus dados. Tente novamente mais tarde.");
    }
};


self.ListarEventos = async (dm) => {
    const eventosSnap = await self.db.collection('eventos').get();
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
};

self.Evento = async (interaction, dm, filter) => {
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
            switch (escolha) {
                case self.opcoesMenus.evento.ADICIONAR_EXCLUIR_EVENTO:
                    await self.AdicionarExcluirEventos(dm, filter);
                    break;
                case self.opcoesMenus.evento.INICIAR_EVENTO:
                    await self.IniciarEvento(dm, filter);
                    break;
                case self.opcoesMenus.evento.PARTICIPAR_EVENTO:
                    await self.ParticiparEvento(dm, filter);
                    break;
                case self.opcoesMenus.evento.LISTAR_EVENTOS:
                    await self.ListarEventos(dm);
                    break;
                default:
                    break;
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
};

self.Recrutar = async (interaction, filter) => {
    await interaction.deferReply({ ephemeral: true });

    try {
        await self.dm.send("👋 Olá! Vamos preencher seu formulário de entrada:");
        const respostas = [];

        for (let i = 0; i < self.perguntas.length; i++) {
            let respostaValida = false;

            while (!respostaValida) {
                await self.dm.send(self.perguntas[i].texto);
                const respostaColetada = await self.dm.awaitMessages({ filter, max: 1, time: 60000 });

                if (!respostaColetada.size) {
                    await self.dm.send("⏰ Tempo esgotado. Tente novamente mais tarde.");
                    await interaction.editReply({ content: '❌ Formulário cancelado por inatividade.' });
                    return;
                }

                const resposta = respostaColetada.first().content.trim();
                if (self.perguntas[i].validar && !self.perguntas[i].validar.test(resposta)) {
                    await self.dm.send(i === 1 ? "❗ Opção errada, tente novamente. Digite um número de 1 a 4." : "❗ Esse campo só aceita números, favor digitar novamente.");
                } else {
                    respostas[i] = resposta;
                    respostaValida = true;
                }
            }
        }

        await self.SalvarNoFirebase(self.user.id, respostas);
        await self.dm.send("✅ Formulário recebido com sucesso! Bem-vindo à guilda.");
        await interaction.editReply({ content: '📩 Formulário preenchido com sucesso via DM!' });
    } catch (err) {
        console.error("❌ Erro ao iniciar formulário:", err);
        await interaction.editReply({ content: '❌ Não consegui enviar sua DM. Verifique se você está com DMs abertas.' });
    }
};

// --------- LOJA -----------

self.Loja = async (interaction, dm, filter, user) => {
    await interaction.deferReply({ ephemeral: true });

    try {
        let continuar = true;
        await dm.send(`📛 Jogador: **${user.nick}**\n💰 Pontos totais: **${user.pontos}**\n📋 Lista de itens:`);
        while (continuar) {
            await dm.send(
                "🛒 **Menu da Loja**:\n" +
                "1️⃣ - Cadastrar novo item\n" +
                "2️⃣ - Excluir item por nome\n" +
                "3️⃣ - Cadastrar em lote\n" +
                "4️⃣ - Listar itens cadastrados\n\n" +
                "Digite o número da opção desejada:"
            );

            const escolha = await self.coletarResposta(dm, filter, /^[1-4]$/, "❗ Opção inválida. Escolha um número de 1 a 4.");

            if (escolha === "1") {
                await dm.send("📝 Digite o nome do item:");
                const nome = await self.coletarResposta(dm, filter);

                await dm.send("💯 Digite os pontos do item:");
                const pontos = await self.coletarResposta(dm, filter, /^\d+$/, "❗ Só números. Tente novamente.");

                await self.db.collection('itensLoja').doc(nome).set({ nome, pontos: parseInt(pontos) });
                await dm.send(`✅ Item **${nome}** cadastrado com sucesso com **${pontos}** pontos.`);
            }

            if (escolha === "2") {
                await dm.send("🗑️ Digite o nome do item que deseja excluir:");
                const nome = await self.coletarResposta(dm, filter);
                await self.db.collection('itensLoja').doc(nome).delete();
                await dm.send(`🗑️ Item **${nome}** excluído com sucesso.`);
            }

            if (escolha === "3") {
                await dm.send("⏳ Iniciando cadastro em lote...");
                const rawData = self.fs.readFileSync('loadStore.json');
                const jsonData = JSON.parse(rawData);
                const items = jsonData.content;

                if (!Array.isArray(items)) throw new Error("O JSON não possui um array chamado 'content'.");

                const batch = self.db.batch();
                items.forEach(item => {
                    const ref = self.db.collection('itensLoja').doc(item.nome);
                    batch.set(ref, item);
                });

                await batch.commit();
                await dm.send(`✅ Cadastro em lote concluído! ${items.length} itens adicionados.`);
            }

            if (escolha === "4") {
                const snapshot = await self.db.collection('itensLoja').get();

                if (snapshot.empty) {
                    await dm.send("📭 Nenhum item cadastrado.");
                } else {
                    const items = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        items.push(`• ${data.nome} — ${data.pontos} pontos`);
                    });

                    // Envia em blocos de até 1900 caracteres para evitar corte do Discord
                    let bloco = "";
                    for (const linha of items) {
                        if ((bloco + linha + '\n').length > 1900) {
                            await dm.send(bloco);
                            bloco = "";
                        }
                        bloco += linha + '\n';
                    }
                    if (bloco.length > 0) await dm.send(bloco);
                }
            }

            await dm.send("❓ Deseja fazer mais alguma coisa?\n1 - Sim\n2 - Encerrar");
            const resp = await self.coletarResposta(dm, filter, /^[1-2]$/, "❗ Responda com 1 ou 2.");
            if (resp === "2") continuar = false;
        }

        await dm.send("👋 Encerrando o menu da loja. Até a próxima!");
        await interaction.editReply({ content: '📩 Execução finalizada via DM.' });

    } catch (error) {
        console.error("❌ Erro na função loja:", error);
        await dm.send("❌ Ocorreu um erro. Verifique o console para mais detalhes.");
    }
};

// ---------- BUILD E LOGIN ----------

self.Build = () => {
    self.LoadReferences();
    self.LoadEvents();
};

self.Build();
self.client.login(process.env.TOKEN);


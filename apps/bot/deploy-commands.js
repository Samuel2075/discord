require('dotenv').config();
const { REST, Routes } = require('discord.js');

const commands = [
    {
        name: 'recrutar',
        description: 'Inicia manualmente o formulário de entrada via DM'
    },
    {
        name: 'evento',
        description: 'Comando para gerenciar, iniciar ou participar de um evento'
    },
    {
        name: 'loja',
        description: 'Comando para gerenciar a loja'
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('🔁 Registrando comandos de barra (/)...');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID), // escopo global
            // Para escopo por servidor: Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
            { body: commands }
        );

        console.log('✅ Comandos registrados com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao registrar comandos:', error);
    }
})();

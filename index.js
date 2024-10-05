const { Client, GatewayIntentBits, Collection, SlashCommandBuilder,Events } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.login(process.env.TOKEN);


mongoose.connect('mongodb://localhost:27017/RagexCheck').then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Failed to connect to MongoDB', err);
});


const RegexCheck = require('./ragexCheck.js');
const TrustedUser = require('./trustedUser');


client.commands = new Collection();
const commands = [
    new SlashCommandBuilder()
        .setName('addregex')
        .setDescription('Add a new regex check')
        .addStringOption(option => 
            option.setName('pattern')
                  .setDescription('The regex pattern')
                  .setRequired(true))
        .addIntegerOption(option => 
            option.setName('severity')
                  .setDescription('1: Silent delete, 2: Warn, 3: Kick')
                  .setRequired(true)),

    new SlashCommandBuilder()
        .setName('listregex')
        .setDescription('List all regex checks'),

    new SlashCommandBuilder()
        .setName('deleteregex')
        .setDescription('Delete a regex check')
        .addIntegerOption(option => 
            option.setName('id')
                  .setDescription('The ID of the regex check')
                  .setRequired(true)),

    new SlashCommandBuilder()
        .setName('addtrusted')
        .setDescription('Make a trusted user ')
        .addUserOption(option => 
            option.setName('user')
                  .setDescription('Trusted User')
                  .setRequired(true)),

    new SlashCommandBuilder()
        .setName('removetrusted')
        .setDescription('Remove a user from the trusted list')
        .addUserOption(option => 
            option.setName('user')
                  .setDescription('The user to remove')
                  .setRequired(true))
];



client.on(Events.ClientReady, () => {
    client.application.commands.set(commands);
    console.log(`✅ ${client.user.tag} is online`);
});


client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const member = interaction.member;
    
    const isAdmin = member.roles.cache.some(role => role.name === 'Admin'); 
    const isModerator = member.roles.cache.some(role => role.name === 'Moderator'); 

    if ( !isAdmin && !isModerator) {
        await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        return;

    }


    const modLogChannel = interaction.guild.channels.cache.find(channel => channel.name === 'moderator-log');

    
    if (interaction.commandName === 'addregex') {
        await interaction.deferReply({ ephemeral: true });

        const pattern = interaction.options.getString('pattern');
        const severity = interaction.options.getInteger('severity');

        if (![1, 2, 3].includes(severity)) {
            await interaction.editReply({ content: 'Invalid severity level. Use 1 (silent delete), 2 (warn), or 3 (kick).' });
            return;
        }

        const latestCheck = await RegexCheck.findOne().sort('-id').exec();
        const newId = latestCheck ? latestCheck.id + 1 : 1;

        const newRegexCheck = new RegexCheck({
            id: newId,
            pattern,
            severity
        });

        await newRegexCheck.save();
        await interaction.editReply(`Added new regex check with pattern: \`${pattern}\`, severity level: ${severity}`);

    }

   
    if (interaction.commandName === 'listregex') {
        const regexChecks = await RegexCheck.find();
        if (regexChecks.length === 0) {
            await interaction.reply({ content: 'No regex checks found.', ephemeral: true });
            return;
        }
        const list = regexChecks.map(check => `ID: ${check.id} | Pattern: \`${check.pattern}\` | Severity: ${check.severity}`).join('\n');
        await interaction.reply({ content: list, ephemeral: true });
    }

    
    if (interaction.commandName === 'deleteregex') {
        const id = interaction.options.getInteger('id');
        const regexCheck = await RegexCheck.findOne({ id });
        if (!regexCheck) {
            await interaction.reply({ content: `No regex check found with ID ${id}.`, ephemeral: true });
            return;
        }
        await RegexCheck.deleteOne({ id });
        await interaction.reply(`Deleted regex check with ID: ${id}`);
    }

    
    if (interaction.commandName === 'addtrusted') {
        const user = interaction.options.getUser('user');
        const trustedUser = await TrustedUser.findOne({ userId: user.id });

        if (trustedUser) {
            await interaction.reply({ content: `${user.tag} is already trusted.`, ephemeral: true });
        } else {
            const newTrustedUser = new TrustedUser({ userId: user.id });
            await newTrustedUser.save();
            await interaction.reply({ content: `${user.tag} is now trusted and exempt from regex checks.`, ephemeral: true });
        }
    }

    
    if (interaction.commandName === 'removetrusted') {
        const user = interaction.options.getUser('user');
        const trustedUser = await TrustedUser.findOne({ userId: user.id });

        if (!trustedUser) {
            await interaction.reply({ content: `${user.tag} is not trusted.`, ephemeral: true });
        } 
        else {
            await TrustedUser.deleteOne({ userId: user.id });
            await interaction.reply({ content: `${user.tag} is no longer trusted and will be subject to regex checks.`, ephemeral: true });

        }
    }
});


client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    
    const trustedUser = await TrustedUser.findOne({ userId: message.author.id });
    if (trustedUser) return; 

    const regexChecks = await RegexCheck.find();

    for (const check of regexChecks) {
        const regex = new RegExp(check.pattern, 'i'); 

        if (regex.test(message.content)) {
            switch (check.severity) {
                case 1:
                    await message.delete();
                    if (modLogChannel) modLogChannel.send(`Message from ${message.author.tag} deleted silently (ID: ${check.id})`);
                    break;

                case 2:
                    await message.delete();
                    await message.channel.send(`${message.author}, your message was deleted due to violation of server rules.`);

                    if (modLogChannel) modLogChannel.send(`Message from ${message.author.tag} deleted and warned (ID: ${check.id})`);

                    break;

                case 3:

                    await message.delete();
                    try {
                       
                        const memberToKick = await message.guild.members.fetch(message.author.id);

                        if (!memberToKick) {

                            if (modLogChannel) modLogChannel.send(`User ${message.author.tag} not found .`);
                            break;
                        }

                        await message.author.send(`You have been kicked from ${message.guild.name}due to violating server rules bcz of message: "${message.content}"`);

                        await memberToKick.kick('VIOLATED SERVER RULES.');

                        if (modLogChannel) modLogChannel.send(`Message from ${message.author.tag} deleted and user kicked (ID: ${check.id})`);

                    } 
                    catch (error) {
                      console.error(`Failed to kick user ${message.author.tag}:`, error);

                    }

                    break;

                default:
                    break;
            }
            break; 
        }
    }
});



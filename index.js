require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());

// Adicione CORS para aceitar requisições do seu site
const cors = require("cors");
app.use(cors());

// Servir arquivos estáticos (HTML, CSS, JS)
app.use(express.static("."));

// Rota para a página inicial
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/login.html");
});

const client = new MongoClient(process.env.MONGO_URI);
let db, usuarios, atividades;

// Conectar ao MongoDB Atlas
async function conectarDB() {
  try {
    await client.connect();
    db = client.db("meuProjeto");
    usuarios = db.collection("usuarios");
    atividades = db.collection("atividades");
    console.log("✅ Banco conectado!");
  } catch (erro) {
    console.error("❌ Erro ao conectar:", erro);
  }
}
conectarDB();

// Middleware para tratamento de erros
const tratarErro = (res, erro, status = 500) => {
  console.error(erro);
  res.status(status).json({ erro: erro.message });
};

// Registro de usuário
app.post("/register", async (req, res) => {
  try {
    const { username, email, senha } = req.body;
    
    if (!username || !email || !senha) {
      return res.status(400).json({ msg: "Campos obrigatórios faltando" });
    }
    
    const usuarioExistente = await usuarios.findOne({ email });
    if (usuarioExistente) {
      return res.status(409).json({ msg: "Email já registrado" });
    }
    
    const senhaHash = await bcrypt.hash(senha, 10);
    const resultado = await usuarios.insertOne({ username, email, senhaHash });
    
    res.json({ msg: "Usuário registrado!", id: resultado.insertedId });
  } catch (erro) {
    tratarErro(res, erro);
  }
});

// Login de usuário
app.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = await usuarios.findOne({ email });
    
    if (!usuario) return res.status(404).json({ msg: "Usuário não encontrado" });

    const valido = await bcrypt.compare(senha, usuario.senhaHash);
    if (!valido) return res.status(401).json({ msg: "Senha incorreta" });

    res.json({ msg: "Login bem-sucedido", usuarioId: usuario._id, username: usuario.username });
  } catch (erro) {
    tratarErro(res, erro);
  }
});

// Salvar nota de atividade COM AVALIAÇÃO AUTOMÁTICA
app.post("/atividades", async (req, res) => {
  try {
    const { usuarioId, atividadeId, codigo } = req.body;
    
    console.log("📨 Recebido POST /atividades:", { usuarioId, atividadeId, codigo: codigo ? codigo.substring(0, 50) : "vazio" });
    
    if (!usuarioId) return res.status(400).json({ msg: "usuarioId é obrigatório" });
    if (!atividadeId) return res.status(400).json({ msg: "atividadeId é obrigatório" });
    if (!codigo) return res.status(400).json({ msg: "codigo é obrigatório" });

    const userIdObj = new ObjectId(usuarioId);

    // Não permitir nova submissão se já tiver aprovado com nota máxima (10)
    const aprovado = await atividades.findOne({ usuarioId: userIdObj, atividadeId: parseInt(atividadeId), nota: { $gte: 10 } });
    if (aprovado) {
      return res.status(403).json({ msg: "Atividade já concluída com sucesso. Não é possível enviar novamente." });
    }
    
    // Avaliar o código automaticamente
    const nota = avaliarAtividade(atividadeId, codigo);
    const atividade = `Exercício ${atividadeId}`;
    
    console.log("✅ Avaliado com nota:", nota);
    
    const resultado = await atividades.insertOne({ 
      usuarioId: userIdObj, 
      atividadeId: parseInt(atividadeId),
      atividade,
      codigo,
      nota, 
      data: new Date() 
    });
    
    res.json({ msg: "Atividade avaliada!", id: resultado.insertedId, nota });
  } catch (erro) {
    console.error("❌ Erro em /atividades:", erro);
    tratarErro(res, erro);
  }
});

// Verifica status de atividade para não reabrir se concluída
app.get("/atividades/:usuarioId/:atividadeId/status", async (req, res) => {
  try {
    const { usuarioId, atividadeId } = req.params;
    if (!usuarioId || !atividadeId) {
      return res.status(400).json({ msg: "usuarioId e atividadeId são obrigatórios" });
    }

    const conclusao = await atividades.findOne({
      usuarioId: new ObjectId(usuarioId),
      atividadeId: parseInt(atividadeId),
      nota: { $gte: 10 }
    });

    res.json({ concluido: Boolean(conclusao), nota: conclusao ? conclusao.nota : null });
  } catch (erro) {
    tratarErro(res, erro);
  }
});

// Função para avaliar automaticamente cada exercício
function avaliarAtividade(atividadeId, codigo) {
  const id = Number(atividadeId);
  const codigoLower = codigo.toLowerCase().trim();
  let nota = 5; // Nota mínima por tentar

  switch(id) {
    case 1: {
      // Exercício 1: Hello World - requer print("Hello World") ou print('Hello World')
      const correto1 = codigoLower.includes('print("hello world")') || codigoLower.includes("print('hello world')");
      const correto2 = codigoLower.includes('print("olá mundo")') || codigoLower.includes("print('olá mundo')");

      if (correto1 || correto2) {
        nota = 10;
        console.log(`✅ Exercício 1: Sintaxe PERFEITA! print("Hello World") = 10/10`);
      } else if (codigoLower.includes('print') && codigoLower.includes('hello') && codigoLower.includes('world')) {
        nota = 7;
        console.log(`⚠️  Exercício 1: Tem as palavras mas sintaxe errada = 7/10`);
      } else if (codigoLower.includes('print')) {
        nota = 5;
        console.log(`📌 Exercício 1: Tem print mas falta o resto = 5/10`);
      }
      break;
    }

    case 2: {
      // Exercício 2: Calculadora - requer função com +/- e */ operações
      const padraoCalc = /def\s+\w+\s*\(.*\):[\s\S]*[0-9]+\s*[\+\-\*\/]\s*[0-9]+/;
      if (padraoCalc.test(codigo)) {
        nota = 10;
        console.log(`✅ Exercício 2: Def e operações presentes = 10/10`);
      } else if (codigoLower.includes('def')) {
        nota = 7;
        console.log(`⚠️  Exercício 2: Tem def mas falta operação completa = 7/10`);
      } else {
        nota = 5;
        console.log(`📌 Exercício 2: Tentativa mínima = 5/10`);
      }
      break;
    }

    case 3: {
      // Exercício 3: Lista de Compras - requer append + remove
      if (codigoLower.includes('append') && codigoLower.includes('remove')) {
        nota = 10;
        console.log(`✅ Exercício 3: append e remove presentes = 10/10`);
      } else if (codigoLower.includes('append') || codigoLower.includes('remove')) {
        nota = 7;
        console.log(`⚠️  Exercício 3: Método parcial = 7/10`);
      } else {
        nota = 5;
        console.log(`📌 Exercício 3: Tentativa mínima = 5/10`);
      }
      break;
    }

    case 4: {
      // Exercício 4: Jogo da Adivinhação - requer random + input + while
      if (codigoLower.includes('random') && codigoLower.includes('input') && codigoLower.includes('while')) {
        nota = 10;
        console.log(`✅ Exercício 4: random/input/while = 10/10`);
      } else if (codigoLower.includes('while')) {
        nota = 7;
        console.log(`⚠️  Exercício 4: while presente, mas faltam random/input = 7/10`);
      } else {
        nota = 5;
        console.log(`📌 Exercício 4: Tentativa mínima = 5/10`);
      }
      break;
    }

    case 5: {
      // Exercício 5: Análise de Dados - requer sum, len, max ou min
      const hasSum = codigoLower.includes('sum');
      const hasLen = codigoLower.includes('len');
      const hasMax = codigoLower.includes('max');
      const hasMin = codigoLower.includes('min');

      if ((hasSum || hasLen) && (hasMax || hasMin)) {
        nota = 10;
        console.log(`✅ Exercício 5: Funções de análise presentes = 10/10`);
      } else if (hasSum || hasLen || hasMax || hasMin) {
        nota = 7;
        console.log(`⚠️  Exercício 5: Só parte da análise = 7/10`);
      } else {
        nota = 5;
        console.log(`📌 Exercício 5: Tentativa mínima = 5/10`);
      }
      break;
    }

    case 6: {
      // Exercício 6: Projeto - requer def + for + if
      const hasDef = codigoLower.includes('def');
      const hasFor = codigoLower.includes('for');
      const hasIf = codigoLower.includes('if');

      if (hasDef && hasFor && hasIf) {
        nota = 10;
        console.log(`✅ Exercício 6: def/for/if presentes = 10/10`);
      } else if ((hasDef || hasFor) && hasIf) {
        nota = 7;
        console.log(`⚠️  Exercício 6: Estrutura parcial = 7/10`);
      } else {
        nota = 5;
        console.log(`📌 Exercício 6: Tentativa mínima = 5/10`);
      }
      break;
    }

    default:
      nota = 1;
  }

  return Math.min(10, Math.max(1, nota));
}

// Consultar ranking
app.get("/ranks", async (req, res) => {
  try {
    const ranking = await atividades.aggregate([
      // Pegar a maior nota por usuário + atividadeId (sem repetição)
      {
        $sort: { nota: -1 }
      },
      {
        $group: {
          _id: { usuarioId: '$usuarioId', atividadeId: '$atividadeId' },
          melhorNota: { $first: '$nota' }
        }
      },
      // Agrupar novamente por usuário para somar as melhores notas
      {
        $group: {
          _id: '$_id.usuarioId',
          totalAtividades: { $sum: 1 },
          pontuacaoTotal: { $sum: '$melhorNota' }
        }
      },
      // Join com tabela de usuários
      {
        $lookup: {
          from: 'usuarios',
          localField: '_id',
          foreignField: '_id',
          as: 'usuario'
        }
      },
      {
        $unwind: {
          path: '$usuario',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          username: { $ifNull: ['$usuario.username', 'Usuário'] },
          media: { $cond: [{ $eq: ['$totalAtividades', 0] }, 0, { $divide: ['$pontuacaoTotal', '$totalAtividades'] }] }
        }
      },
      {
        $project: {
          _id: 0,
          usuarioId: { $toString: '$_id' },
          username: 1,
          totalAtividades: 1,
          pontuacaoTotal: 1,
          media: 1
        }
      },
      // Ordenar por pontuação total (maior primeiro)
      { $sort: { pontuacaoTotal: -1 } },
      { $limit: 10 }
    ]).toArray();

    if (!ranking || ranking.length === 0) {
      return res.json([]);
    }

    res.json(ranking);
  } catch (erro) {
    tratarErro(res, erro);
  }
});

// Obter dados do usuário
app.get("/usuarios/:id", async (req, res) => {
  try {
    const usuario = await usuarios.findOne({ _id: new ObjectId(req.params.id) });
    if (!usuario) return res.status(404).json({ msg: "Usuário não encontrado" });
    
    const { senhaHash, ...usuarioSeguro } = usuario;
    res.json(usuarioSeguro);
  } catch (erro) {
    tratarErro(res, erro);
  }
});

// Listar todos os usuários (remova em produção se necessário)
app.get("/usuarios", async (req, res) => {
  try {
    const lista = await usuarios.find().toArray();
    res.json(lista);
  } catch (erro) {
    tratarErro(res, erro);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));

// Supondo que você já tenha User e Activity models
const RankRules = [
  { nome: "Bronze", notaMinima: 0, tempoMaximo: 9999 },
  { nome: "Prata", notaMinima: 60, tempoMaximo: 300 },
  { nome: "Ouro", notaMinima: 75, tempoMaximo: 180 },
  { nome: "Platina", notaMinima: 85, tempoMaximo: 120 },
  { nome: "Diamante", notaMinima: 95, tempoMaximo: 60 }
];

async function registrarAtividade(usuarioId, atividadeId, nota, tempoConclusao) {
  // 1. Salvar atividade
  const atividade = new Activity({ usuarioId, atividadeId, nota, tempoConclusao });
  await atividade.save();

  // 2. Determinar rank
  let rank = "Bronze";
  for (const regra of RankRules) {
    if (nota >= regra.notaMinima && tempoConclusao <= regra.tempoMaximo) {
      rank = regra.nome;
    }
  }

  // 3. Atualizar usuário
  await User.findByIdAndUpdate(usuarioId, { rankAtual: rank });
}

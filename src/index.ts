import { initializeKeypair } from "./initializeKeypair"
import * as web3 from "@solana/web3.js"
import * as token from "@solana/spl-token"
import dotenv from "dotenv"
import { createInitializeMintInstruction } from "@solana/spl-token"
import {
    Metaplex,
    keypairIdentity,
    bundlrStorage,
    toMetaplexFile,
    findMetadataPda,
    associatedTokenProgram,
    Account,
} from "@metaplex-foundation/js"
import {
    DataV2,
    createCreateMetadataAccountV2Instruction,
    createUpdateMetadataAccountV2Instruction,
} from "@metaplex-foundation/mpl-token-metadata"
import * as fs from "fs"
import {
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    createAssociatedTokenAccountInstruction, 
    createInitializeMint2Instruction, 
    getAccount, getAssociatedTokenAddress, 
    getMinimumBalanceForRentExemptAccount, 
    getMinimumBalanceForRentExemptMint, 
    getOrCreateAssociatedTokenAccount, 
    MINT_SIZE, 
    TOKEN_PROGRAM_ID, 
    TokenAccountNotFoundError,
    TokenInvalidAccountOwnerError,
} from "@solana/spl-token"

dotenv.config()

async function createTokenMintInstruction(
    connection: web3.Connection,
    user: web3.Keypair,
    mintAuthority: web3.PublicKey,
    freezeAuthority: web3.PublicKey,
    decimals: number,
    keypair = web3.Keypair.generate()
): Promise<[web3.TransactionInstruction, web3.TransactionInstruction, web3.Keypair]> {

    const lamports = await getMinimumBalanceForRentExemptMint(connection)
    const programId = token.TOKEN_PROGRAM_ID

    const mintInstruction = web3.SystemProgram.createAccount(
        {
            fromPubkey: user.publicKey,
            newAccountPubkey: keypair.publicKey,
            space: MINT_SIZE,
            lamports: lamports,
            programId: programId
        }
    )
    const initMintInstruction = createInitializeMintInstruction(keypair.publicKey, decimals, mintAuthority, freezeAuthority, programId)
    fs.appendFileSync(".env", `\nMINT=${keypair.publicKey.toString()}`)
    return [mintInstruction, initMintInstruction, keypair]
}

async function createMetadataAccountInstruction(
    connection: web3.Connection,
    metaplex: Metaplex,
    user: web3.Keypair,
    mint: web3.PublicKey,
    name: string,
    symbol: string,
    description: string
): Promise<[web3.TransactionInstruction]> {
    const buffer = fs.readFileSync("assets/rulette.png")
    const file = toMetaplexFile(buffer, "rulette.png")

    const imageUri = await metaplex.storage().upload(file)
    const { uri } = await metaplex.nfts().uploadMetadata({
        name: name,
        description: description,
        image: imageUri
    })
    const metadataPDA = metaplex.nfts().pdas().metadata({ mint })

    const tokenMetadata = {
        name: name,
        symbol: symbol,
        uri: uri,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null
    } as DataV2

    const metadataInstruction = createCreateMetadataAccountV2Instruction(
        {
            metadata: metadataPDA,
            mint: mint,
            payer: user.publicKey,
            mintAuthority: user.publicKey,
            updateAuthority: user.publicKey,
        },
        {
            createMetadataAccountArgsV2: {
                data: tokenMetadata,
                isMutable: true
            }
        }
    )

    return [metadataInstruction]
}

async function createTokenAccountInstruction(
    connection: web3.Connection,
    payer: web3.Keypair,
    mint: web3.PublicKey,
    owner: web3.PublicKey,
    programId = TOKEN_PROGRAM_ID,
    associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): Promise<web3.TransactionInstruction | null> {
    const associatedToken = await getAssociatedTokenAddress(
        mint,
        owner,
        false,
        programId,
        associatedTokenProgramId
    )
    const tokenAccountInstruction = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        associatedToken,
        owner,
        mint
    )

    let account
    try {
        // check if token account already exists
        account = await getAccount(
            connection,
            associatedToken
        )
        
        return null
    } catch (error: unknown) {
        if (
            error instanceof TokenAccountNotFoundError ||
            error instanceof TokenInvalidAccountOwnerError
        ) {
            try {
                // add instruction to create token account if one does not exist
                fs.appendFileSync(".env", `\nTOKEN_ACCOUNT=${associatedToken.toString()}`)
                return tokenAccountInstruction
            } catch (error: unknown) {
                return null
            }
        } else {
            throw error
            return null
        }
    }


}

async function main() {
    const connection = new web3.Connection(web3.clusterApiUrl("devnet"))
    const user = await initializeKeypair(connection)
    const [mintInstruction, initMintInstruction, keypair] = await createTokenMintInstruction(
        connection, user, user.publicKey, user.publicKey, 2
    )
    console.log(keypair.publicKey.toBase58())
    const metaplex = Metaplex.make(connection)
        .use(keypairIdentity(user))
        .use(
            bundlrStorage({
                address: "https://devnet.bundlr.network",
                providerUrl: "https://api.devnet.solana.com",
                timeout: 60000
            }))
    const [metadataInstruction] = await createMetadataAccountInstruction(
        connection, metaplex, user, keypair.publicKey, "Coin", "CC", "Dev coin for testing metaplex ts libraries"
    )

    const tokenAccountInstruction = await createTokenAccountInstruction(
        connection, user, keypair.publicKey, user.publicKey
    )
    if (tokenAccountInstruction) {
        const transaction = new web3.Transaction().add(
            mintInstruction, initMintInstruction, metadataInstruction, tokenAccountInstruction
        )
        const transactionSignature = await web3.sendAndConfirmTransaction(connection, transaction, [user, keypair])
        console.log(`Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`)

        const associatedToken = await getAssociatedTokenAddress(keypair.publicKey, user.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)

        console.log("Token Account:", associatedToken.toString())
        console.log("Mint Adress:", keypair.publicKey.toString())
    } else {
        const transaction = new web3.Transaction().add(
            mintInstruction, initMintInstruction, metadataInstruction
        )
        const transactionSignature = await web3.sendAndConfirmTransaction(connection, transaction, [user, keypair])
        console.log(`Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`)
    }

}

main()
    .then(() => {
        console.log("Finished successfully")
        process.exit(0)
    })
    .catch((error) => {
        console.log(error)
        process.exit(1)
    })

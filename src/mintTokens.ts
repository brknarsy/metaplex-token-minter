import { initializeKeypair } from "./initializeKeypair"
import * as token from "@solana/spl-token"
import * as web3 from "@solana/web3.js"
import dotenv from "dotenv"
dotenv.config()

async function mintTokens(
    connection: web3.Connection,
    payer: web3.Keypair,
    mint: web3.PublicKey,
    destination: web3.PublicKey,
    authority: web3.Keypair,
    amount: number
) {
    const mintInfo = await token.getMint(connection, mint)
    const transactionSignature = await token.mintTo(
        connection,
        payer,
        mint,
        destination,
        authority,
        amount * 10 ** mintInfo.decimals
    )

    console.log(
        `Mint Token Transaction: https://explorer.solana.com/tx/${transactionSignature}?cluster=devnet`
    )
}

async function main() {
    const connection = new web3.Connection(web3.clusterApiUrl("devnet"))
    const user = await initializeKeypair(connection)
    if(process.env.MINT && process.env.TOKEN_ACCOUNT) {
        await mintTokens(
            connection,
            user,
            new web3.PublicKey(process.env.MINT),
            new web3.PublicKey(process.env.TOKEN_ACCOUNT),
            user,
            100
        )
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

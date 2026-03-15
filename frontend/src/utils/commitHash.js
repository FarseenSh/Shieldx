import { ethers } from "ethers";

export function generateCommitment(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(32));
  const salt = ethers.hexlify(saltBytes);

  const commitHash = ethers.solidityPackedKeccak256(
    ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt]
  );

  return {
    commitHash,
    salt,
    params: { orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice },
  };
}

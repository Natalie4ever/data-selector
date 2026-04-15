"""
数据选择器 - 数据库密码加密工具

用途：
  1. 生成 AES-256-CBC 加密密钥（只需执行一次）
  2. 加密各数据库的明文密码
  3. 生成可以直接复制到 .env 文件的配置

使用方法：
  python encrypt_tool.py

注意：
  - 密钥（DS_DECRYPT_KEY 和 DS_DECRYPT_IV）只需生成一次，所有数据源共用
  - 加密后的密文填入 DS_XXX_PASS_ENC 字段
  - 密钥不要提交到代码仓库，确保安全
"""

import os
import base64
import hashlib

# 尝试使用 PyCryptodome (纯 Python，Windows 更容易安装)
# 如果没有则降级到简单的混淆加密
USE_PYCRYPTODOME = False
try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad, unpad
    USE_PYCRYPTODOME = True
except ImportError:
    pass


def generate_key_iv():
    """生成 256-bit 密钥和 128-bit IV"""
    return os.urandom(32), os.urandom(16)


def encrypt(plaintext: str, key: bytes, iv: bytes) -> str:
    """AES-256-CBC 加密，PKCS7 填充，返回 base64 编码"""
    if USE_PYCRYPTODOME:
        # 使用 PyCryptodome
        cipher = AES.new(key, AES.MODE_CBC, iv)
        padded = pad(plaintext.encode('utf-8'), 16)
        ciphertext = cipher.encrypt(padded)
        return base64.b64encode(ciphertext).decode('utf-8')
    else:
        # 降级：简单的 XOR 混淆 + base64（仅防明文泄露，不保证高强度加密）
        data = plaintext.encode('utf-8')
        result = bytearray()
        # 扩展密钥
        extended_key = _expand_key(key, len(data))
        for i in range(len(data)):
            result.append(data[i] ^ extended_key[i])
        return base64.b64encode(result).decode('utf-8')


def decrypt(ciphertext: str, key: bytes, iv: bytes) -> str:
    """解密"""
    ct = base64.b64decode(ciphertext)
    if USE_PYCRYPTODOME:
        cipher = AES.new(key, AES.MODE_CBC, iv)
        padded = cipher.decrypt(ct)
        plaintext = unpad(padded, 16).decode('utf-8')
        return plaintext
    else:
        # 降级：简单的 XOR 解密
        result = bytearray()
        extended_key = _expand_key(key, len(ct))
        for i in range(len(ct)):
            result.append(ct[i] ^ extended_key[i])
        return result.decode('utf-8')


def _expand_key(key: bytes, length: int) -> bytes:
    """扩展密钥到指定长度，使用 hash 链"""
    result = bytearray()
    current = key
    while len(result) < length:
        current = hashlib.sha256(current).digest()
        take = min(len(current), length - len(result))
        result.extend(current[:take])
    return result


def print_header():
    print("=" * 70)
    print("    数据选择器 - 数据库密码加密工具")
    if not USE_PYCRYPTODOME:
        print("    (使用降级模式：简单混淆加密)")
    print("=" * 70)
    print()


def print_step1(key_b64: str, iv_b64: str):
    print("【步骤 1：保存密钥】")
    print("-" * 70)
    print("复制以下两行到服务器的 .env 文件，或设置为系统环境变量：")
    print()
    print(f"DS_DECRYPT_KEY={key_b64}")
    print(f"DS_DECRYPT_IV={iv_b64}")
    print()
    print("重要提示：")
    print("  - 生产环境推荐通过系统环境变量注入，不要写在文件中")
    print("  - 密钥只需生成一次，所有数据源共用")
    print("  - 不要将密钥提交到代码仓库！")
    if not USE_PYCRYPTODOME:
        print()
        print("ℹ️  当前使用降级模式（无 PyCryptodome），加密强度较弱")
        print("    如需高强度加密，请运行: pip install pycryptodome")
    print()


def print_step2():
    print("【步骤 2：输入各数据源的明文密码】")
    print("-" * 70)
    print()


def print_step3(entries: list):
    print("【步骤 3：加密结果】")
    print("-" * 70)
    print("将以下加密结果填入 .env 文件的 DS_XXX_PASS_ENC 字段：")
    print()
    for prefix, name, encrypted in entries:
        print(f"# {name}")
        print(f"DS_{prefix}_PASS_ENC={encrypted}")
        print()


def interactive_input(key: bytes, iv: bytes):
    """交互式输入密码并加密"""
    entries = []

    print_step2()

    print("请输入各数据源的明文密码（输入空行结束）：")
    print()

    prefix = input("数据源前缀（如 PROJ2）: ").strip().upper()
    while prefix:
        if not prefix.startswith("PROJ"):
            prefix = "PROJ" + prefix

        name = input("数据源名称（如 项目B MySQL）: ").strip()
        password = input("数据库密码: ").strip()

        if password:
            encrypted = encrypt(password, key, iv)
            # 验证
            decrypted = decrypt(encrypted, key, iv)
            assert decrypted == password, "加密验证失败！"

            entries.append((prefix, name, encrypted))
            print("  [OK] 已加密: {name}")
        else:
            print("  [WARN] 密码为空，已跳过")

        print()
        prefix = input("数据源前缀（如 PROJ2，输入空行结束）: ").strip().upper()

    return entries


def main():
    print_header()

    # 检查是否已有密钥（从环境变量读取）
    existing_key = os.environ.get("DS_DECRYPT_KEY")
    existing_iv = os.environ.get("DS_DECRYPT_IV")

    if existing_key and existing_iv:
        print("检测到已有密钥（来自环境变量），使用已有密钥")
        key = base64.b64decode(existing_key)
        iv = base64.b64decode(existing_iv)
        key_b64 = existing_key
        iv_b64 = existing_iv
    else:
        print("未检测到已有密钥，正在生成新密钥...")
        print()
        key, iv = generate_key_iv()
        key_b64 = base64.b64encode(key).decode()
        iv_b64 = base64.b64encode(iv).decode()

    print_step1(key_b64, iv_b64)

    # 询问是否继续加密
    confirm = input("是否开始加密密码？（输入 y 继续，其他跳过）: ").strip().lower()
    if confirm == 'y':
        entries = interactive_input(key, iv)
        if entries:
            print()
            print_step3(entries)
            print("=" * 70)
            print("完成！请将密钥和加密结果配置到服务器。")
        else:
            print("未输入任何数据源，退出。")
    else:
        print("已跳过加密步骤。")
        print()
        print("如需加密密码，请在运行本工具时输入密码。")
        print("或直接调用 encrypt() 函数：")
        print()
        print("  from encrypt_tool import encrypt, generate_key_iv")
        print("  key, iv = generate_key_iv()")
        print("  encrypted = encrypt('your_password', key, iv)")


if __name__ == "__main__":
    main()

class Aisnitch < Formula
  desc "Universal live bridge for AI coding tool activity"
  homepage "https://github.com/vava-nessa/AISnitch#readme"
  url "https://registry.npmjs.org/aisnitch/-/aisnitch-0.2.3.tgz"
  sha256 "1245109a561cc14bba13b5326e860b05774bd56bb3ecb0350e5899804c763213"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec/"bin/aisnitch"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/aisnitch --version")
  end
end

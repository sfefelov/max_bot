#скачать поставить https://almalinux.org/ru/get-almalinux/
#wget https://repo.almalinux.org/almalinux/10/isos/x86_64/AlmaLinux-10.1-x86_64-boot.iso


sudo dnf check-update
sudo dnf update
sudo dnf upgrade

sudo dnf install -y git
git --version
#git config --global user.name "<username>"
#git config --global user.email "<username@email.local>"
git config --global color.ui auto
#ssh-keygen -t ed25519 -C "<username@email.local>"
#eval "$(ssh-agent -s)"
#ssh-add ~/.ssh/id_ed25519
#cat ~/.ssh/id_ed25519.pub >>> INSERT to github
#ssh -T git@github.com

dnf install mc

cd /home/
mkdir max_bot
cd /home/max_bot/
git clone git@github.com:sfefelov/max_bot.git
dnf remove docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-selinux docker-engine-selinux docker-engine podman podman-docker -y
dnf install -y dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker


docker compose up --build

